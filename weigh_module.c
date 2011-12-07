#include <stdlib.h>
#include <stdio.h>
#include <glib.h>
#include <errno.h>
#include <fts.h>
#include <string.h>
#include <sys/stat.h>

/* 
	1223760 mine
	1226144 real (ext3)
	1190231 real (ntfs)
	 811730 du
	 
	2.74%
	0.19%

	which, assuming the installation goes for 5 minutes, is: 8 seconds or half a second
 */
int main(int argc, char **argv)
{
    char *dot[] = {".", 0};
    char **paths = argc > 1 ? argv + 1 : dot;
    
    int global_block_size = 4096;
    guint64 all_blocks = 0;
	guint block_size=0;

    FTS *tree = fts_open(paths, FTS_NOCHDIR, 0);
    if (!tree)
    {
        perror("fts_open");
        return 1;
    }

    FTSENT *node;
    while ((node = fts_read(tree)))
    {
        if (node->fts_level > 0 && node->fts_name[0] == '.')
            fts_set(tree, node, FTS_SKIP);
        else if (node->fts_info & FTS_F)
        {
			guint64 size = node->fts_statp->st_size;
			block_size = global_block_size ? global_block_size : node->fts_statp->st_blksize;
			guint64 block_count = (size-1)/block_size+1;
			all_blocks += block_count;
			//g_print("%s %d\n",node->fts_path, block_count*block_size/1024);
        }
    }
    if (errno) {
        perror("fts_read");
        return 1;
    }

    if (fts_close(tree)) {
        perror("fts_close");
        return 1;
    }

	g_print("%d",all_blocks*block_size/1024);
    return 0;
}
