#include <glib.h>
#include <stdlib.h>

void LaunchLnvconf(gchar* item_name, GHashTable* options)
{
	gchar* lnvconf_cmds[] = {"lnvconf","--post-install",item_name,NULL};
	
	int pid;		
	if ((pid = fork()) == -1)
		perror("fork() error");
	else if (pid == 0)
	{	
		/* Set the environment according to the options hashtable */
		GHashTableIter iter;
		gpointer key, value;
		
		g_hash_table_iter_init(&iter, options);
		while (g_hash_table_iter_next(&iter, &key, &value))
			if (g_variant_is_of_type((GVariant*)value,G_VARIANT_TYPE_STRING))
				g_setenv((gchar*)key,g_variant_get_string((GVariant*)value,NULL),TRUE);

		execvp(lnvconf_cmds[0], lnvconf_cmds);	         
	}
}
