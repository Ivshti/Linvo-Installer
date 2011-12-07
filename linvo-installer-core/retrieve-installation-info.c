#include <sys/vfs.h>
#include <glib.h>
#include <stdio.h>
 
#include "misc.h"

/*
 * Gets information about any installation that lies
 * on the specific partition using os-prober
 * 
 */

#define OSPROBER_LINE_MAX 512
GHashTable* OSProber_read()
{
	static GHashTable* data;
	if (!data)
	{
		data = g_hash_table_new(g_str_hash,g_str_equal);
	
		FILE *fp;
		int status;
		char line[OSPROBER_LINE_MAX];

		fp = popen("os-prober", "r");
		if (fp == NULL)
			g_critical("Could not start os-prober");

		while (fgets(line, OSPROBER_LINE_MAX, fp) != NULL)
		{
			gchar** line_split = g_strsplit(line,":",-1);
			g_hash_table_insert(data, line_split[0], line_split);
		}

		status = pclose(fp);
		if (status == -1)
		{
			/* Error reported by pclose() */
		} else 
		{
			/* Use macros described under wait() to inspect `status' in order
			   to determine success/failure of command executed by popen() */

		}
	}
	
	return data;
}

guint64 GetFreeSpace(gchar* mountpoint)
{
	struct statfs s;
	statfs(mountpoint,&s);
	return kscale(s.f_bfree, s.f_bsize);
}

/* Retrieve an object with the information about an operating system (non-Linvo) that we have on a mountpoint */
GHashTable* GetOtherInstallationObject(gchar* mountpoint)
{
	GHashTable* installation_object = g_hash_table_new(g_str_hash, g_str_equal);
	GHashTable* osprober_data = OSProber_read();
	gchar* device = GetDevFromMountpoint(mountpoint);
	gchar** osprober_line;

	/* If the mountpoint actually has a device mounted on it and it corresponds to an os-prober result entry */
	if (device && (osprober_line = g_hash_table_lookup(osprober_data,device)))
	{
		g_hash_table_insert(installation_object,"Name",g_variant_new_string(osprober_line[1]));
		g_hash_table_insert(installation_object,"BootLabel",g_variant_new_string(osprober_line[2]));
		g_hash_table_insert(installation_object,"BootType",g_variant_new_string(osprober_line[3]));

	}

	return installation_object;
}
