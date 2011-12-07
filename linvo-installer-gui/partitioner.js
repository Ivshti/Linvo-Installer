/*
* Basically, a hack to make up for the fact that UDisks does not support moving/resizing file-systems 
* and partitions
* 
*/

/* 
 * TODO
 * > refactor the interface; exit if file-system check fails
 * > helpers to resize fat
 * > EXTREMELY IMPORTANT: if a fourth (or whatever partition limit - find that) partition is requested to be added to a HDD, add an EXTENDED one first!
 * > and in general, manage extended partitions transparently; can find limit using ped_disk_get_max_{primary,supported}_partition_count
 * Move on ext* and btrfs/hfs* /jfs/ntfs/reizer4/reiserfs/ufs/xfs is provided by GParted,
 * on fat* move/shrink/grow is provided by libparted
 * 
 * HFS - shrink only (libparted)
 * 
 * Also, keep in mind read calls in GParted; usually that would be fstat, but ntfs would require another tool 
 * 
 * Also, always pass bytes-1 when resizing
 * */
MEBIBYTE = 1048576; //2^20, aka megabyte

 /* 
 * Resize(device,bytes,blocks,mountpoint)
 * */


ext_filesystem = 
		{
			RequiredExternal: "resize2fs",
			Resize: function(device,bytes) { return this.RequiredExternal+" "+device+" "+Math.round(bytes/1024)+"K"}
		};

filesystems = 
{
	"btrfs":
		{
			RequiredExternal: "btrfs",
			Resize: function(device,bytes) { return this.RequiredExternal+" resize "+bytes+" "+device; },
			Min: 256 * MEBIBYTE
		},
	"ext2": ext_filesystem,
	"ext3": ext_filesystem,
	"ext4": ext_filesystem,
	"fat16": 
		{
			Min: 16 * MEBIBYTE,
			Max: (4096 - 1) * MEBIBYTE  //Maximum seems to be just less than 4096 MiB
		},
	"fat32":
		{
			Min: 32 * MEBIBYTE
		},
	"hfs": 
		{
			Max: 2048 * MEBIBYTE,
			SupportsGrow: false
		},
	"hfsplus":
		{
			SupportsGrow: false
		},
	"jfs": 
		{
			/* TODO: Side note: this must be carefully tested */
			Resize: function(device,bytes,blocks,mountpoint) {return "mount -o remount,resize="+blocks+" "+mountpoint;},
			RequiresMounted: true,
			Min: 16 * MEBIBYTE
		},
	"linux_swap":
		{
			Recreate: true
		},
	"ntfs":
		{
			/* TODO Bug here: "y" must be passed into the pipe of resize_reiserfs */
			RequiredExternal: "ntfsresize",
			Resize: function(device,bytes) { return this.RequiredExternal+" -P --force --size "+bytes+" "+device;}
		},
	"reiser4":
		{
			//shrink/resize not supported :(
			SupportsShrink: false,
			SupportsGrow: false
		},
	"reiserfs":
		{
			/* TODO Bug here: "y" must be passed into the pipe of resize_reiserfs */
			RequiredExternal: "resize_reiserfs",
			Resize: function(device,bytes) {return this.RequiredExternal+" "+device+" -s "+bytes},
			Min: 34 * MEBIBYTE
		},
	"ufs":
		{
			SupportsShrink: false,
			SupportsGrow: false
		},
	"xfs":
		{
			SupportsShrink: false,
			RequiredExternal: "xfs_growfs",
			RequiresMounted: true,
			/* since, when growing (only one supported here), we have first grown the partition, we do not need to specify the size (it will be grown to the maximum) */
			Resize: function(device,bytes,blocks,mountpoint) { return this.RequiredExternal+" "+mountpoint},
			Min: 32 * MEBIBYTE
		}
};

/*
 * Utility functions 
 *
 */
function Device(device_path)
{
	var partition = dbus.getInterface(dbus.SYSTEM,"org.freedesktop.UDisks",device_path,"org.freedesktop.UDisks.Device");
	var props_interface = dbus.getInterface(dbus.SYSTEM,"org.freedesktop.UDisks",device_path,"org.freedesktop.DBus.Properties");
	props_interface.GetAll.async = false;
	props_interface.GetAll.onreply = function(props) { partition.Properties = props; };
	props_interface.GetAll("org.freedesktop.UDisks.Device");
	
	return partition;
}

/* 
 * Operations
 * 
 * 
*/

/* Returns a command that would change a partition's geometry */
function SetPartitionGeometry(partition, offset, size)
{
	var device_file = Device(partition.Properties.PartitionSlave).Properties.DeviceFile;
	var partition_number = partition.Properties.PartitionNumber;
	
	offset = parseInt(offset);
	size = parseInt(size);
	block_size = parseInt(partition.Properties.DeviceBlockSize);

	/* Calls parted to change the geometry */
	//return "parted --script "+device_file+" move "+partition_number+" "+offset+"B "+(offset+size)+"B";
	return "/usr/libexec/parted_set_partition_geometry "+device_file+" "+partition_number+" "+Math.round(offset/block_size)+" "+Math.round((offset+size)/block_size);
}

/* Returns a command that would resize a file-system */
function ResizeFilesystem(partition, size)
{	
	filesystem = filesystems[partition.Properties.IdType];
	return filesystem.Resize(partition.Properties.DeviceFile,parseInt(size));
}

/* 
 * A class for the queue of operations
 * 
 *  */
function operation_queue() {};
operation_queue.prototype =
{
	pending: new Array(),
	next: function() { console.log("next operation in the queue fired"); },
	add:  function(action) { this.pending.push(action); },
	apply: function()
	{
		for (i in this.pending)
		{
			action = this.pending[i];
			type = typeof(action);
			
			if (type == "function")
			{
				/*  Something like this:
				 *  var args = Array.prototype.slice.call(arguments);  var obj = dbus[args[0]].apply(dbus[args[0]], args.slice(1)); */
				//action.
				//action();
			}
			else if (type == "string")
				console.log(this.pending[i]);
		}
	}
}

/* 
 * 
 * Gateways to operations ; that's what you call 
 * 
 * 
 * */
queue = new operation_queue();

function Resize(partition,size)
{
	filesystem = filesystems[partition.Properties.IdType];
	
	if (!filesystem)
		throw "Trying to resize an unknown filesystem"+partition.Properties.IdType;
	
	if (filesystem.Recreate)
	{
		queue.add(partition.PartitionDelete,[]);
		return;
	}
	
	/*if (filesystem.RequiresMounted)
		queue.add(); //TODO: mount
	else
		queue.add(partition.FilesystemUnmount,[]);	
	*/
	
	/* Check filesystem */
	queue.add(partition.FilesystemCheck,[]);

	if (partition.Properties.PartitionSize > size)
	{
		// shrink
		if (filesystem.SupportsShrink == false) 
			return false;

		queue.add(ResizeFilesystem(partition,size));	
		queue.add(SetPartitionGeometry(partition,partition.Properties.PartitionOffset,size));
	}
	else
	{
		// expand
		if (filesystem.SupportsExpand == false) 
			return false;
		
		queue.add(SetPartitionGeometry(partition,partition.Properties.PartitionOffset,size));
		queue.add(ResizeFilesystem(partition,size));
	}
}


/*
 * Print table
console.log("Grow\tShrink\tMove");
for (fs_type in filesystems)
{
	filesystem = filesystems[fs_type];

	console.log(
	((filesystem.SupportsGrow==false)?"O":"X")+"\t"+
	((filesystem.SupportsShrink==false)?"O":"X")+"\t"+
	"X");
}
*/

//partition = Device("/org/freedesktop/UDisks/devices/sda8");
//Resize(partition,15503139692); //15858307584 original size 355167892 lower
//Resize(partition,15147971800);
//Resize(partition,15858307584);
//queue.apply();

partition = Device("/org/freedesktop/UDisks/devices/sda1");
Resize(partition,56482965504);
queue.apply();
