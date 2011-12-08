/* 
 * TODO: 
 * > automatic algorithm with alternative proposals and intelligent messages (e.g. "the only way to install Linvo is to resize FS X, but it needs check")
 * #> sort devices, removable last
 * #> free space at end (thus at the entire HDD if no partitions)
 * > dynamic resize/move/delete/add of partitions, undo/redo
 * > re-do the addpartition method so it can be called without importance of the partitions order (in order to implement proper udisks plug-and-play); or when something is plugged, wait via a counter until PartitionTableCount is reached
 * and if a partition table on a disk is modified, call a re-read which re-builds the entire disk
 * #> first implement the polling of information (taken space)
 * > upon an empty device, offer "create a partition table"?
 * 
 * #> Add a "TryAddFreeSpace(start,end)" function that would add free space between start and end if needed; in order to apply this to the space in the end of a drive, we need to get the count of it's sectors
 * > make extended partitions transparent (partitioner.js to handle them - adding/removing, automatic adding if more than *limit* partitions)
 */

	
/*To be put out of this file */
function UserFriendlySize(bytes)
{
	var divide_by = 1000; // It seems we have to divide by 1000 instead of 1024
	var units = ["B","KB","MB","GB","TB","YB"];
	var unit_index=0;
	
	while (bytes>divide_by)
	{
		bytes/=divide_by;
		unit_index++;
	}
	
	return Math.round(bytes)+" "+units[unit_index];
}

var PartitionSlavesElements = new Object();
var PartitionInterfaces = new Array();
var PartitionInstallationInfo = new Array();

var PartitionModifyActions = new Array();

function FillInterface(elem)
{	
	/* 
	 * Add a partition table to the DOM tree
	 * and to the PartitionSlavesElements object
	 *  
	 **/
	function AddPartitionTable(device, device_path)
	{
		/* Create a DOM element for a slave and store it in an object */
		var slave_elem = $("#storage-device-template").clone().attr("id",null)
			.data("device-object",device)
			.appendTo(elem.find(device.Properties.DeviceIsRemovable ? "#removable-storage-devices" : "#storage-devices"));
		
		slave_elem.find(".title").text(
			device.Properties.DriveVendor + " "+ 
			device.Properties.DriveModel
			+" ("+UserFriendlySize(device.Properties.DeviceSize)+")"
		);
		
		PartitionSlavesElements[device_path] = { elem: slave_elem, dbus_interface: device, last_end: 0 };
	}

	/* Make final preperations to the partition table */
	function FinishPartitionTable(slave_index, slave)
	{
		var device_end;
		
		installer.CallHelper.async = false;
		installer.CallHelper.onreply = function(sectors) { device_end = sectors * slave.dbus_interface.Properties.DeviceBlockSize; };
		installer.CallHelper(["/usr/libexec/parted_get_max_sectors",slave.dbus_interface.Properties.DeviceFile]);
		
		TryAddFreeSpace(slave.last_end,device_end, slave.dbus_interface, slave.elem.find(".partitions"));

		var partition_elems = slave.elem.find(".partition");
		var partition_min_size = 10;//100/partition_elems.length;
		var sum_percentage = 0;
			
		/* Now go through the partitions and add "grow" (visually) the partitions that are too small for the user to see */
		partition_elems.each(function()
		{
			var width_percentage = $(this).width();
			if (width_percentage < partition_min_size)
			{
				width_percentage = partition_min_size;
				$(this).css("width",width_percentage+"%");
			}
			
			sum_percentage += width_percentage;		
		});
	
		if (sum_percentage > 100)
		{
			var coefficient = 100/sum_percentage;
			partition_elems.each(function()
			{
				 $(this).width(($(this).width()*coefficient)+"%"); 
			});
		}
	
	}

	/* 
	 * Add a free space "partition" entry if there
	 * is free space between start and end
	 */
	function TryAddFreeSpace(start, end, slave, slave_elem)
	{
		/* WARNING/TODO
		 * 63 is not a constant, it's the sector count in SHC
		 * AND this check might not be appropriate if checking for free space in the end; but anyways, no one is going to care if ~32 kilobytes don't show up as free space
		 */
		if (start != end && end-start>(63*slave.Properties.DeviceBlockSize))
		{
			$("#partition-template").clone().attr("id",null).addClass("freespace")
				.width(((end-start)/slave.Properties.DeviceSize * 100)+"%")
				.data("start",start)
				.data("end",end)
				.appendTo(slave_elem);
		}
	}
	/* 
	 * Add a partition to the DOM element of the relevant slave
	 *  
	 **/
	var colormap = { ext2: "red", ext3: "red", ext4: "orange", btrfs: "yellow", vfat: "grey", hfs: "cyan", 
				hfsplus: "cyan", ntfs: "blue", xfs: "coral", jfs: "moccasin", swap: "lightgrey", reiser: "silver", reiser4: "green"};

	function IsExtended(type)
	{
		return (type == 0x05 || type == 0x85 || type == 0x0f);
	}
		
	function AddPartition(index, partition)
	{
		if (IsExtended(parseInt(partition.Properties.PartitionType,16)))
			return;
		
		var slave_obj = PartitionSlavesElements[partition.Properties.PartitionSlave];
		var slave = slave_obj.dbus_interface;
		var slave_elem = slave_obj.elem.find(".partitions");
		
		var start = partition.Properties.PartitionOffset;
		var size = partition.Properties.PartitionSize;

		/* Check if there is free space preceeding the partition */
		TryAddFreeSpace(slave_obj.last_end, start, slave, slave_elem);
		
		/* Add the outline element and set it's position and width */
		var partition_elem = $("#partition-template").clone().attr("id",null).appendTo(slave_elem);
		partition_elem.css("width", (size/slave.Properties.DeviceSize * 100)+"%");
		
		/* Add some useful information to it */
		partition_elem.css("background-color", colormap[partition.Properties.IdType]);
		partition_elem.find(".size").text(UserFriendlySize(size));
		partition_elem.find(".type").text(partition.Properties.IdType.toUpperCase());
		partition_elem.data("device-object",partition);
		partition_elem.attr("data-device-path",partition.device_path); /* apparently, data- does not work the same as data(), so I can't use CSS selectors unless this is an attribute and not data */
		
		/* TODO: os-prober (started by RetrieveInstallationInfo) mounts all the partitions, and we do the same;
		 * maybe we can pass only the path to the device to RetrieveInstallationInfo and get os-prober to leave all the partitions mounted */
		if (!partition.Properties.DeviceIsMounted)
		{
			/* TODO */
			console.log("have to mount partition "+partition.Properties.DeviceFile);
			/*
			mountpoint = ...
			partition.FilesystemMount.onreply = function()
			{
				installer.RetrieveInstallationInfo.onreply = function(info) { GlueInstallationInfo(partition_elem, info); };
				installer.RetrieveInstallationInfo(mountpoint);
			};
			partition.FilesystemMount();
			*/
		}
		else
		{
			installer.RetrieveInstallationInfo.async = false;
			installer.RetrieveInstallationInfo.onreply = function(info)
			{ 
				var free_space = (100-((info.FreeSpace/size)*1024)*100);
				partition_elem.find(".space-usage").width(free_space+"%");

				PartitionInstallationInfo[i] = info;
			};
			installer.RetrieveInstallationInfo(partition.Properties.DeviceMountPaths[0]);
		}
		
		/* Keep track of the last end so that we can put free space when we have to */
		slave_obj.last_end = start+size;
	}

	/* Step 1
	 * Enumerate UDisks devices and add HDD's to DOM
	 * and partitions to an array to be handled later */
	var udisks = dbus.getInterface(dbus.SYSTEM,"org.freedesktop.UDisks","/org/freedesktop/UDisks","org.freedesktop.UDisks");
	udisks.EnumerateDevices.async = false;
	udisks.EnumerateDevices.onreply = function(devices)
	{	
		$.each(devices,function(index,device_path)
		{
			var device = Device(device_path); 
			device.device_path = device_path; /* Attach this to the Device object, for it may be needed */
			
			if (device.Properties.DeviceIsPartitionTable /*&& device.Properties.DeviceIsSystemInternal*/)
				AddPartitionTable(device, device_path);
			else if (device.Properties.DeviceIsPartition)
			{
				/* Push the partition into an array of partition interfaces, to be later added to it's slave */
				/* We do this to make sure all slaves are added when we start adding partitions */
				PartitionInterfaces.push(device);
			}
		});
	};
	udisks.EnumerateDevices();
	
	/* Bind the UDisks event for removing and adding a device */
	udisks.DeviceRemoved.onemit = function(device_path)
	{
		if (PartitionSlavesElements[device_path])
		{
			PartitionSlavesElements[device_path].elem.remove();
			delete PartitionSlavesElements[device_path];
		}
		else
		{
			/* If not found among the slaves, that implies it's a partition */
			$(".partition[data-device-path=\""+device_path+"\"]").remove();
		}
	}
	udisks.DeviceRemoved.enabled = true;
	
	/* The DeviceAdded code is a little more complex; 
	 * 
	 * when a partition table is added the code waits for all it's partitions (using PartitionTableCount)
	 * to also be added before calling FinishPartitionTable
	 * 
	 * */
	var to_add = 0;
	var partitions_queue = Array();
	var slaves_queue = Array();
	//udisks.DeviceAdded.async = false;
	udisks.DeviceAdded.onemit = function(device_path)
	{
		device = Device(device_path);
		if (device.Properties.DeviceIsPartitionTable)
		{
			AddPartitionTable(device, device_path);
			
			slaves_queue.push(PartitionSlavesElements[device_path]);
			to_add += device.Properties.PartitionTableCount;
		}
		else if (device.Properties.DeviceIsPartition)
		{
			/* A non-null here, meaning that we expect a partition to be added because a table was added */
			if (to_add)
			{
				to_add--;
				partitions_queue.push(device);
				
				if (to_add==0) /* The queue is satisfied now */
				{
					$.each(partitions_queue, AddPartition);
					$.each(slaves_queue, FinishPartitionTable);
					
					partitions_queue = Array();
					slaves_queue = Array();
				}
			}
			else /* If it's null, then the partition addition was unexpected, meaning it did not occur because a partition table was added; e.g. newly created partition */
				AddPartition(null,device);
		}
	}
	udisks.DeviceAdded.enabled = true;
	
	/* Add partitions to the GUI */
	/* Begin by sorting by order on the disk */
	PartitionInterfaces.sort(function(part_a,part_b)
	{
		return part_a.Properties.PartitionOffset - part_b.Properties.PartitionOffset;
	});
		
	/* Iterate through the partition list and add them to the DOM */
	$.each(PartitionInterfaces, AddPartition);
	
	/* Iterate through the slaves and to some final preparations */
	$.each(PartitionSlavesElements, FinishPartitionTable);
	
	/* Set-up GUI stuff */

	/*
	 * TODO: the stupid interface
	 * 
	 */
	 
	// Clicking on a partition shows information about it
	$(".partition").live("click",function()
	{
		$(".partition-selected").removeClass("inactive");
		$(".freespace-selected").addClass("inactive");

		//$(this).addClass("selected").siblings().removeClass("selected");
		$(".partition").removeClass("selected");
		$(this).addClass("selected");
		
		var device = $(this).data("device-object");
		if (device)
		{
			/* TODO: clean element before welding */
			$("#partitioner-sidebar").simpleweld(device.Properties);
		}
	});

	/* Clicking on free space causes the new partition button to be activated*/
	$(".freespace").live("click",function()
	{
		$(".partition-selected").addClass("inactive");
		$(".freespace-selected").removeClass("inactive");
	});
	
	/* Action buttons */
	$("#add-partition").click(function()
	{
		function DefaultPartitionType()
		{
			//if (type=="mbr")
				return 0x07;
		}
		
		function DefaultFlags()
		{
			return [];
		}
		
		var selected_elem = $(".selected"); 
		var slave = $(".selected").parent().parent().data("device-object");
		var start = selected_elem.data("start");
		var end = selected_elem.data("end");
		var label = "test"; //temp

		slave.PartitionCreate.async = false;
		slave.PartitionCreate.onreply = function(path){console.log(path);};
		slave.PartitionCreate.onerror = function(err,inf){console.log(err+" "+inf);};
		slave.PartitionCreate(
			start,
			end-start,
			"0x07",
			label,
			[],
			[],
			"ext3",
			[]
		);
		
		/* TODO: properly remove freespace 
		 * NOTE: if udisks fires events even if partitions are modified from outside (e.g. resize2fs) the reflections on the table could be handled entirely by the deviceremove/deviceadd code instead of this
		 * NOPE: i need applying to happen by clicking "apply" rather than directly
		 * */
	});
	
	$("#remove-partition").click(function()
	{
		/* TODO: unmount first, add/merge freespace */
		PartitionModifyActions.push(function()
		{
			$(".selected").data("device-object").PartitionDelete([]); 
		});
	});
	
	
	/* Action forms: bring up fancybox when a button to manipulate a partition is clicked */
	$("#manipulate-partitions-buttons > a").fancybox();
	
	/* What to do when "Apply" is clicked in an action form */
	$("#manipulate-partitions-forms > form").submit(function()
	{
		$.fancybox.close();
		
		var operation_id = $(this).attr("id");
		var selected_partition = $(".selected");
		var selected_disk = selected_partition.parent();
		
		switch(operation_id)
		{
			case "remove":
			{
				
			}
			break;
		}
		
		/* Important to prevent refreshing the page */
		return false;
	});
	
	/* Set the partition as a special Linvo partition */
	$("#set-partition").click(function()
	{
		var device = $(".selected").data("device-object");
		//if (device.) Check free space
		
		install_point = device.Properties.DeviceMountPaths[0];
		$(".partition").removeClass("set-for-linvo");
		$(".selected").addClass("set-for-linvo");
	});

	/* Undo/redo operations */
	$("#undo-button").click(function()
	{
	});
	
	$("#redo-button").click(function()
	{
	});
		
	/* Just a test */
	for (path in PartitionSlavesElements)
		CalculateAuto(PartitionSlavesElements[path].elem, 10737418240);
}

function CalculateAuto(disk_elem, required_space)
{
	disk_elem.children().each(function()
	{
		//console.log("slot behind: "+partition_id);
	
	});
}

/* The actual installer module definition */
InstallerModules.partitions = 
{
	sidebar_entry : 
		{
			title: "Storage", 
			icon: "icons/harddisk.png" 
		},
	fill_content: FillInterface,
	embed_to_templates: "modules/partitioner-templates.html",
	page_template: "modules/partitioner.html",
	on_automatic_enabled: function() { },
};
