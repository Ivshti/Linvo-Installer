/* Compile with: 
 * valac -X /usr/lib/linvoapp.so.3 -X "-I/home/linvo/Desktop/linvo-appsystem-3.0/linvo-appsystem-3.0" --pkg gio-2.0 --pkg posix  linvo-installer-core.vala progress-calculator.c linvo-installer-modules.c retrieve-installation-info.c retrieve-installation-config.c launch-lnvconf.c
 * 
 * 
 * > figure out waiting for configuration to complete
 * > apps copying
 * > DOn't start another operation if one in progress
 * > calculate the weight of the entire system, throw error if filesystem is unable to handle it
 * > calculate the weight of every module according to the fs it's going to be on
 * > figure out the upgrade mode (keeping config in /etc for example)
 * > maybe wait/check for a system to be installed in the addconfigitem code;
 * > when calling lnvconf, if a certain gvariant is an array, convert it to a comma-seperated string (or any serialization of any type)
 * > re-work module weighing to use the helper internally,, and to send a "InstallationFinished" signal when all cp commands exit
 * 		however, just before sending the signal, unlock the config and wait for it's execution (so that config can be done always AFTER cp)
 *  */
 

extern int CalculateProgress(string path, ulong system_weight, int progress_fidelity);
extern void InitializeList();
extern string[] GetPathsToCopy();
extern ulong SetModules(string[] modules);
extern ulong GetSystemWeight();
extern void SetModuleSize(string module_path, int size);
extern uint64 GetFreeSpace(string mountpoint);
extern HashTable<string,Variant> GetOtherInstallationObject(string mountpoint);
extern HashTable<string,Variant> GetInstallationConfigObject(string mountpoint);
extern void LaunchLnvconf(string name, HashTable<string,Variant> options);

[DBus (name = "com.linvo.LinvoInstaller")]
public class LinvoInstaller : Object
{
	/* 
	 * Private variables and methods
	 * 
	 * 
	 * */
	/* Threads */
	private unowned Thread<void*> CopyOperation = null;
    private Mutex WeighingOp = new Mutex();

	/* Operation parameters */
	private string target;
	private string apps_dir = "/memory/data/linvo/modules";
	
	/* Progress parameters */
	private int progress_fidelity = 1000;
	private int check_interval = 500*1000;
	
	/* Status variables */
	string[] mod_list;
	int mod_progress = 0;
	private bool copying_in_place = false;
	
	private ulong system_weight; //=1218048; //dummy value to test it

	private void ResetModulesList()
	{
		mod_list = GetPathsToCopy(); //that should be realoded only when modules enabled/disabled is changed
		mod_progress = 0;
	}
	
	/* 
	 * Weighing part
	 * 
	 * Determine the size of every module after it's installed
	 * 
	 */
	private void WeighNextModule()
	{
		if (mod_progress == mod_list.length)
		{
			WeighingOp.unlock();
			return;
		}

		string module_path = mod_list[mod_progress];
			
		stdout.printf("Weighing module %s\n",module_path);
		string[] weigh_cmd = {"/usr/libexec/weigh_module",module_path,null};
		
		/* explaining order here: the childwatch must exist before the child can finish so it can catch it, so that's right after the process is created; */
		/* the progress of the list iteration must be incremented before that*/
		mod_progress++;		

		int du_output;
        Pid pid;        
        if (!Process.spawn_async_with_pipes (null, weigh_cmd, null, SpawnFlags.DO_NOT_REAP_CHILD|SpawnFlags.STDERR_TO_DEV_NULL, null, out pid,null,out du_output,null))
			return;
			
        ChildWatch.add(pid, WeighNextModule);
        
		size_t bufsize=512;
		void* buffer = (void *)new char[bufsize];
		Posix.read(du_output, buffer, bufsize);
		SetModuleSize(module_path,int.parse((string)buffer));
	}
	
	
	/*
	 * Copying part
	 * 
	 * Copy the Linvo modules from which the system consists (frm the LiveCD) to a newly-installed
	 * system (directory specified by the "target" variable)
	 * 
	 */
	private void CopyNextModule()
	{	
		/* TODO: consider parallelism? */
		
		/* If all the modules in the sequence have been copied, exit */
		if (mod_progress == mod_list.length)
		{
			copying_in_place=false;
			return;
		}
		
		/* Otherwise go on */
		string module_path = mod_list[mod_progress];
		stdout.printf("Copying module %s\n",module_path); 	
		
		/* Compose copying command */
		string[] copying_cmd = { "/bin/cp","-R"};
		string name;
		var d = Dir.open(module_path);
		while ((name = d.read_name()) != null)
			copying_cmd+=module_path+"/"+name;
        copying_cmd+=target;
        copying_cmd+=null; //null-terminated array, since it's passed to a glib func
        
		copying_in_place = true;
		mod_progress++;

        Pid pid;
        if (!Process.spawn_async(null, copying_cmd, null, SpawnFlags.DO_NOT_REAP_CHILD|SpawnFlags.STDERR_TO_DEV_NULL, null, out pid))
			return;
        ChildWatch.add(pid, CopyNextModule);
	}
	
	/* Do copying of modules to the system, watching over progress */
	private void* DoCopying()
	{	
		WeighingOp.lock();
		if (system_weight == 0) /* Get the system weight, unless already set when SetModules was called */
			system_weight = GetSystemWeight();
		
		ResetModulesList();
		if (mod_list.length == 0)
			CriticalError("Unsuitable environment - you're probably not running the installer from a LiveCD.");
			
		/* before starting the copy-modules chain, start (in parallel) a process to copy the applications; this is because /home can be on a different disk so parallelism will pay off */
		/* However, this must be waited for */
		/* Maybe add it to the mod_list[] array and when starting the copy command, check if it begins with apps_dir and if it does, change the destionation to /home/...user/ */
		//Process.spawn_async(null, {"cp","-R","/home/linvo/Applications/",target+"/home/",null}, null, SpawnFlags.DO_NOT_REAP_CHILD|SpawnFlags.STDERR_TO_DEV_NULL, null, null); //copy apps
		CopyNextModule();
        
        /* watch progress here */
        int progress = 0, old_progress = 0;
        
        while (copying_in_place && progress < progress_fidelity-1)
		{
			/* Fire the signal */
			if (old_progress != progress)
				ProgressChanged(progress);
			
			old_progress = progress;
			
			/* And calculate the progress for the next step */
			Thread.usleep(check_interval);
			progress = CalculateProgress(target, system_weight,progress_fidelity);
			
			if (progress == -1)
			{
				AbortingError("Not enough space in this partition to install the system.");
				return null;
			}
		}
        
        //TODO: Wait for configuration to finish
        ProgressChanged(progress_fidelity); // notify that we're finished
        
		return null;
	}
	
	/* 
	 * Constructor
	 * 
	 * Initialize basic modules list and start weighing operation
	 * 
	 */
	public LinvoInstaller()
	{
		stdout.printf("Initialized Linvo Installer Core.\n");
		InitializeList();
		
		/* Reload the list into mod_list and start weighing */
		ResetModulesList();
		WeighingOp.lock();
		mod_list+=apps_dir; /* specifically for weighing, add this to the list */
		WeighNextModule();
	}
	 
	/* 
	 * Start of public (D-Bus exported) Methods
	 * 
	 * 
	 * */
    public async void StartOperation()
    {
		if (target=="") //check if target exists
		{	
			CriticalError("StartOperation requested but target not set");
			return;
		}
		
		CopyOperation = Thread.create<void*> (this.DoCopying, true);
    }
    
    public void AbortOperation()
    {
		//Thread.destroy
	}
	
	public void SetTarget(string _target)
	{
		target = _target;
	}
	
	public void SetProgressFidelity(int fidelity,int interval)
	{
		if (fidelity != 0)
			progress_fidelity = fidelity;
		
		if (interval != 0)
			check_interval = interval;
	}
	
	/* Signals */
	public signal void ProgressChanged(int percent);
    public signal void EstimatedSize(int kilobytes);
	/* Error signals */
	public signal void CriticalError(string err);
	public signal void AbortingError(string err);

	/* 
	 * System configuration 
	 * 
	 * */
	private int pending_lnvconf_calls = 0;
	
	public void AddConfigItem(string item_name, HashTable<string, Variant> item)
	{
		pending_lnvconf_calls++;

		if (CopyOperation!=null)
		{
			CopyOperation.join();
			CopyOperation = null;
		}
		
		/* Pass the target as ROOT to lnvconf and start it */
		item.insert("ROOT",target);
		LaunchLnvconf(item_name, item);
	}

		
	/*
	 * Retrieve information about the OS on that partition and the possibilities to install an OS 
	 * 
	 * */
	public HashTable<string,Variant> RetrieveInstallationInfo(string mountpoint)
	{
		HashTable<string,Variant> installation_properties = new HashTable<string,Variant>(str_hash,str_equal);
		HashTable<string,Variant> os_info = new HashTable<string,Variant>(str_hash,str_equal);
		
		/* Add some information about free space and if it is enough to install the currently set up copy of the OS */
		installation_properties.insert("FreeSpace",GetFreeSpace(mountpoint));
		
		/* Check if HasThisOS */
		var file = File.new_for_path (mountpoint+"/etc/linvo-version");

		if (file.query_exists())
		{
			installation_properties.insert("HasThisOS",1);
			installation_properties.insert("Configuration",GetInstallationConfigObject(mountpoint));

			try 
			{
				var dis = new DataInputStream(file.read());
				string line = dis.read_line(null);
				string[] fragments = line.split(" ");
				if (fragments.length >= 2)
				{
					os_info.insert("Name",fragments[0]);
					os_info.insert("Version",fragments[1]);
				}
			} catch (Error e) 
			{
				error("%s", e.message);
			}			
		}
		/* Check if HasOtherOS ; ose osprober */
		else
		{
			os_info = GetOtherInstallationObject(mountpoint);
			//if (os_info.size() != 0) //Is This really necessary? Having an OSInfo object without HasThisOS implies it
			//	installation_properties.insert("HasOtherOS",1);
		}
	
		installation_properties.insert("OSInfo",os_info);
		
		return installation_properties;
	}
	
	/* A kind-of hack; to be obsolete with the next revision */
	public string CallHelper(string[] argv)
	{
		string helper_output;

		Process.spawn_sync(".", argv, null, SpawnFlags.STDERR_TO_DEV_NULL,null, out helper_output, null, null);

		return helper_output;
	}
}

void on_bus_aquired (DBusConnection conn) 
{
    try 
    {
        conn.register_object ("/com/linvo/LinvoInstaller", new LinvoInstaller());
    } catch (IOError e) {
        stderr.printf ("Could not register service\n");
    }
}

void main () 
{
    Bus.own_name (BusType.SYSTEM, "com.linvo.LinvoInstaller", BusNameOwnerFlags.NONE,
                  on_bus_aquired,
                  () => {},
                  () => stderr.printf ("Could not aquire name\n"));

    new MainLoop().run();
}
