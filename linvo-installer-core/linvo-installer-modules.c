#include <glib.h>
#include <stdio.h>
#include <linvo-app-union-backend.h>
#include <linvo-app.h>
#include <sys/stat.h>
#include <sys/sysmacros.h>
#include <libgen.h>


GHashTable* all_modules;

typedef struct
{
	gchar* path;
	gchar* mountpoint;
	long int size; // In kilobytes
	gboolean enabled;
} LinvoModule;

typedef struct
{
	GHashTable* linvo_modules;
	GHashTable* all_mounts;
} MountsInfo;

MountsInfo GetMounts()
{
	static GHashTable* linvo_modules;
	static GHashTable* all_mounts;

	if (!linvo_modules || !all_mounts)
	{
		linvo_modules = g_hash_table_new(g_str_hash,g_str_equal);
		all_mounts = g_hash_table_new(g_str_hash,g_str_equal);
		
		FILE* mounts = fopen("/proc/mounts","ro");
		gchar buffer[512];
		
		while (fgets(buffer,sizeof(buffer),mounts))
		{
			gchar** tokenized = g_strsplit(buffer," ", -1);
			
			/* we need to refer by mountpoints */
			g_hash_table_insert(all_mounts,g_strcompress(tokenized[1]),tokenized[0]);
			
			/* if it's mounted in the Linvo modules mounting directory (images dir) and a loop device, we have enough data to be sure it's a module */
			if (g_str_has_prefix(tokenized[1],LINVO_APP_IMAGES_DIR) && is_loop_device(tokenized[0]))
				g_hash_table_insert(linvo_modules,basename(tokenized[1]),tokenized[1]);
		}
		fclose(mounts);
	}

	MountsInfo mounts_info;
	mounts_info.linvo_modules = linvo_modules;
	mounts_info.all_mounts = all_mounts;
	return mounts_info;
}

void InitializeList()
{
	MountsInfo mounted_info = GetMounts();
	
	if (!all_modules)
		all_modules = g_hash_table_new(g_str_hash,g_str_equal);
		
	gchar* list_str = linvo_list_base_modules(LINVO_DATA_DIR);
	if (g_strcmp0(list_str,"")==0)
		return;
		
	gchar** list = g_strsplit(list_str,";",-1);
	int i;
	int len = g_strv_length(list);
	for (i=0; i!=len; i++)
	{
		LinvoModule* module = g_malloc(sizeof(LinvoModule));
		module->path = list[i];
		module->mountpoint = g_hash_table_lookup(mounted_info.linvo_modules, basename(module->path));
		module->enabled = TRUE;
		module->size = 0;
		
		g_print("%s %s %d\n",module->path,module->mountpoint,module->enabled);
		g_hash_table_insert(all_modules,g_strdup(basename(list[i])),module);
	}
}

/* Warning: a Vala string[] uses an integer that is passed as a reference to the function as a length indicator */
gchar** GetPathsToCopy(int* result_len)
{
	GList *modules, *elem;
	modules=g_list_alloc();
	
	/* Add every entry of the hash table with an enabled module to the list, sorting it in the process*/
	void add_to_modlist(gpointer key, LinvoModule* module, GList* modules)
	{
		if (module->enabled && module->mountpoint)
			modules = g_list_insert_sorted(modules,g_strdup(module->mountpoint),(GCompareFunc)g_strcmp0);
	}
	g_hash_table_foreach(all_modules,(GHFunc)add_to_modlist,modules);
	
	/* Create a gchar* array and return it */
	int list_len = g_list_length(modules)-1; /* -1? one of the elements is empty (g_list_alloc) */
	*result_len = list_len;
	
	gchar** paths_strv = g_malloc(list_len*sizeof(gchar*));
	int i=0;
	for (elem = modules->next; elem; elem=elem->next) /* start with ->next? first element is empty */
		paths_strv[i++] = elem->data;
	
	return paths_strv;
}

/* Used to report and set the size */
void SetModuleSize(gchar* module_path, int size)
{
	LinvoModule* module = g_hash_table_lookup(all_modules,basename(module_path));
	if (!module)
		return;
	
	module->size = size;
}

/* Sets the modules we have to install */
unsigned long SetModules(gchar** modules)
{
	if (!modules)
		return 0;
	
	unsigned long result = 0;
		
	int i=0;
	LinvoModule* module;
	for (i=0; modules[i]; i++)
		if (module = g_hash_table_lookup(all_modules,basename(modules[i])))
			result+=module->size;
			
	//get estimation
	return result;
}

unsigned long GetSystemWeight()
{
	unsigned long result = 0;
	
	GHashTableIter iter;
	gpointer key, module;

	g_hash_table_iter_init(&iter, all_modules);
	while (g_hash_table_iter_next(&iter, &key, &module)) 
		result+=((LinvoModule*) module)->size;
	
	return result;
}


/* Unrelated misc functions */
#define LOOPMAJOR		7
int is_loop_device (const char *device) 
{
	struct stat st;

	return (stat(device, &st) == 0 &&
		S_ISBLK(st.st_mode) &&
		major(st.st_rdev) == LOOPMAJOR);
}

gchar* GetDevFromMountpoint(gchar* mountpoint)
{
	MountsInfo mounted_info = GetMounts();
	return g_hash_table_lookup(mounted_info.all_mounts,mountpoint);
}
