#include <parted/parted.h>
#include <stdlib.h>

/* TODO: error reporting/handling */

int main(int argc, char** argv)
{
	PedDevice* device = ped_device_get(argv[1]);
	if (!device) return 1;

	PedDisk* disk = ped_disk_new(device);

	PedPartition* partition = ped_disk_get_partition(disk, atoi(argv[2]));
	if (!partition) return 1;

	ped_disk_set_partition_geom(disk,partition,ped_device_get_constraint(device),
		atoi(argv[3]),
		atoi(argv[4])
	);
	ped_disk_commit(disk);
	
	return 0;
}
