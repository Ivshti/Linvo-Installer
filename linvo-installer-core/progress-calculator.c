#include <sys/vfs.h>

unsigned long kscale(unsigned long b, unsigned long bs)
{
	return (b * (unsigned long long) bs + 1024/2) / 1024;
}

/* Returns a value from 0-progress_fidelity unless error occurs (-1) */
int CalculateProgress(const char* path, unsigned long system_weight, int progress_fidelity)
{
	struct statfs s;
	statfs(path,&s);
	
	/* Note: first multiply by 100, then divide by the size of the whole thing; reason: we're dealing with long int's here, not floats, so if *100 is in the end, the first part will be 
	 * rounded to 1 or 0, which will result in a progress of 0 or 100 */
	return (kscale(s.f_blocks - s.f_bfree, s.f_bsize))*progress_fidelity/system_weight;
}
