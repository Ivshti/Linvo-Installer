#include <glib.h>
#include <stdio.h>

/* 
 * Retrieves the configuration of a 
 * Linvo installation
 */

void users_retrieve(gchar* mountpoint, GHashTable* config_object)
{
	char line[255];

	/* First build a groups table */
	GHashTable* users_groups = g_hash_table_new(g_str_hash, g_str_equal);
	FILE* groups_fh = fopen(g_strconcat(mountpoint,"/etc/group",NULL),"r");
	if (!groups_fh)
	{
		g_warning("Unable to open /etc/groups");
		return;
	}	
	
	while(fgets(line,sizeof(line),groups_fh))
	{
		gchar** line_fields = g_strsplit(line,":",-1);
		if (g_strcmp0(line_fields[3],"") == 0)
			continue;
		
		gchar* group = line_fields[0];
		gchar** users = g_strsplit(g_strchomp(line_fields[3]),",",-1);
	
		int i;
		int len = g_strv_length(users);
		for (i=0; i!=len; i++)
		{
			/* For each user try to finds it's array of groups in the hashtable and append that group to it */
			GVariantBuilder* groups_of_user = g_hash_table_lookup(users_groups,users[i]);
			if (!groups_of_user)
			{
				groups_of_user = g_variant_builder_new(G_VARIANT_TYPE_ARRAY);
				g_hash_table_insert(users_groups, users[i], groups_of_user);
			}
			
			g_variant_builder_add_value(groups_of_user,g_variant_new_string(group));
		}
	}
	fclose(groups_fh);

	/* Now an array of users */
	GVariantBuilder *array_builder = g_variant_builder_new(G_VARIANT_TYPE_ARRAY);
	
	FILE* users_fh = fopen(g_strconcat(mountpoint,"/etc/passwd",NULL),"r");
	if (!users_fh)
	{
		g_warning("Unable to open /etc/passwd");
		return;
	}
		
	while(fgets(line,sizeof(line),users_fh))
	{
		gchar** line_fields = g_strsplit(line,":",-1);
		gchar** gecos_fields = g_strsplit(line_fields[4],",",-1);
		
		guint32 uid = atoi(line_fields[2]);
		if (uid<500)
			continue;

		/* A little bit of crappy-verbose code to build the structure describing the user */
		GVariantBuilder *user_entry = g_variant_builder_new(G_VARIANT_TYPE_DICTIONARY);
		g_variant_builder_add(user_entry,"{sv}", "Username", g_variant_new_string(line_fields[0]));
		g_variant_builder_add(user_entry,"{sv}", "UID", g_variant_new_uint32(uid));
 		g_variant_builder_add(user_entry,"{sv}", "GUID", g_variant_new_uint32(atoi(line_fields[3])));
		g_variant_builder_add(user_entry,"{sv}", "Home", g_variant_new_string(line_fields[5]));
		
		/* For groups information, make a look-up to the hashtable we built */
		GVariantBuilder* groups_of_user = NULL;
		if (groups_of_user = g_hash_table_lookup(users_groups,line_fields[0]))
			g_variant_builder_add(user_entry,"{sv}", "Groups", g_variant_builder_end(groups_of_user));
		
		/* Add Gecos information */
		gchar* gecos_fields_meta[] = {"Fullname","ContactInfo","Phone","Fax"}; //I don't know the GECOS order yet
		int i;
		int len = g_strv_length(gecos_fields);
		for (i=0; i!=len; i++)
			g_variant_builder_add(user_entry,"{sv}", gecos_fields_meta[i], g_variant_new_string(gecos_fields[i]));

		/* Finally, add apps */
		//TODO; think about resolving /home paths
		
		g_variant_builder_add_value(array_builder, g_variant_builder_end(user_entry));
	}
	fclose(users_fh);
	
	/* Add the array of users to the configuration objects with a name of "Users" */
	g_hash_table_insert(config_object,"Users",g_variant_builder_end(array_builder));
}

void language_retrieve(gchar* mountpoint, GHashTable* config_object)
{
}

void (*config_readers[])(gchar*, GHashTable*) = { users_retrieve, language_retrieve };
GHashTable* GetInstallationConfigObject(gchar* mountpoint)
{
	GHashTable* config_object = g_hash_table_new(g_str_hash,g_str_equal);
	int i;
	for (i=0; i!=sizeof(config_readers)/sizeof(*config_readers); i++)	
		config_readers[i](mountpoint,config_object);

	return config_object;
}
