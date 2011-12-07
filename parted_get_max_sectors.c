#include <parted/parted.h>
#include <stdlib.h>

/* TODO: error reporting/handling */

int main(int argc, char** argv)
{
	PedDevice* device = ped_device_get(argv[1]);
	if (!device) return 1;

	PedDisk* disk = ped_disk_new(device);

	printf("%d\n",device->bios_geom.sectors * device->bios_geom.heads * device->bios_geom.cylinders);
	
	return 0;
}
