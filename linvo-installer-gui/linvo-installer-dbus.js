/*
 * TODO: error if not connecting to bus
 */

// globally scoped (no "var")
installer = dbus.getInterface(dbus.SYSTEM,"com.linvo.LinvoInstaller", "/com/linvo/LinvoInstaller", "com.linvo.LinvoInstaller");
if (!installer)
	ErrorMessage("#installer-dbus-error");

installer.ProgressChanged.onemit = function(progress)
{
	console.log(progress);
	/* TODO: set progress using a setProgressFidely function to the client that would set the fidelity to equal the pixel width of the progress bar; then, on each signal, put this number of pixels as a width */
	$("#progress-bar").css("width",progress/10+"%");
};
installer.ProgressChanged.enabled = true;

installer.CriticalError.onemit = function(err) { console.log(err); };
installer.CriticalError.enabled = true;


/*installer.SetTarget("/tmp/linvo-inst");
installer.StartOperation();

// Must always be executed after StartOperation; need to think about that 
installer.AddConfigItem("user-add",
	{Username: "linvo",
	Password: "hello world",
	Groups: "floppy,audio,video,cdrom,plugdev,netdev,scanner,power,lp,games,pulse,pulse-access,adm,desktop_admin_r,desktop_user_r",
	Home: "/home/linvo"
	});
	
installer.AddConfigItem("user-modify",{Username: "linvo", Home: "/home/ivo"});
*/
var notifications = dbus.getInterface(dbus.SESSION,"org.freedesktop.Notifications","/org/freedesktop/Notifications","org.freedesktop.Notifications");
notifications.Notify("Linvo Installer",0,"","Installation started","The installation process is currently in progress.",[],{},-1);
