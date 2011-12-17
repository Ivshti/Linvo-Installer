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
 * #> utility setActive for GUI elements (would also disable events)
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

/* An array describing the previous/next states of a slave; used for undo/redo and queuing actions */
var PartitionSlavesStates = new Array();
var currentState = -1; /* begin at -1 because this points to an element of an array, and when the first element is pushed it must become 0 */

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
			.pData("device-object",device)
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
			var width_percentage = $(this).widthPercentage();

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
				 $(this).width(($(this).widthPercentage()*coefficient)+"%"); 
			});
		}
	
	}

	/* 
	 * Add a free space "partition" entry if there
	 * is free space between start and end
	 */
	 function FreeSpaceElem() { return $("#partition-template").clone().attr("id",null).addClass("freespace"); }
	function TryAddFreeSpace(start, end, slave, slave_elem)
	{
		/* WARNING/TODO
		 * 63 is not a constant, it's the sector count in SHC
		 * AND this check might not be appropriate if checking for free space in the end; but anyways, no one is going to care if ~32 kilobytes don't show up as free space
		 */
		if (start != end && end-start>(63*slave.Properties.DeviceBlockSize))
		{
			var free_space_elem = FreeSpaceElem()
				.width(((end-start)/slave.Properties.DeviceSize * 100)+"%")
				.pData("start",start)
				.pData("end",end);
			
			free_space_elem.appendTo(slave_elem);
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
		partition_elem.pData("device-object",partition);
		partition_elem.attr("data-device-path",partition.device_path); /* apparently, data- does not work the same as data(), so I can't use CSS selectors unless this is an attribute and not data */
		
		partition_elem
			.pData("start",start)
			.pData("end",start+size);
		
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
	 * on each event, we check if the queue is satisfied
	 * 
	 * */
	var to_add = 0;
	var partitions_queue = Array();
	var slaves_queue = Array();
	//udisks.DeviceAdded.async = false;
	
	function CheckQueueSatisfied()
	{
		if (to_add == 0) /* The queue is satisfied now */
		{
			$.each(partitions_queue, AddPartition);
			$.each(slaves_queue, FinishPartitionTable);
			
			partitions_queue = Array();
			slaves_queue = Array();
		}
	}
	
	udisks.DeviceAdded.onemit = function(device_path)
	{
		device = Device(device_path);
		
		if (device.Properties.DeviceIsPartitionTable)
		{
			AddPartitionTable(device, device_path);
			
			slaves_queue.push(PartitionSlavesElements[device_path]);
			to_add += device.Properties.PartitionTableCount;
			
			CheckQueueSatisfied();
		}
		else if (device.Properties.DeviceIsPartition)
		{
			/* A non-null here, meaning that we expect a partition to be added because a table was added */
			if (to_add)
			{
				to_add--;
				partitions_queue.push(device);
				
				CheckQueueSatisfied();
			}
			else /* If it's null, then the partition addition was unexpected, meaning it did not occur because a partition table was added; e.g. newly created partition */
				AddPartition(null,device); /* THE UNEXPECTED EVENT HANDLER WILL GO HERE */
		}
	}
	udisks.DeviceAdded.enabled = true;
	
	/* 
	 * Add partitions to the GUI 
	 * 
	 * */
	 
	/* Begin by sorting by order on the disk */
	PartitionInterfaces.sort(function(part_a,part_b)
	{
		return part_a.Properties.PartitionOffset - part_b.Properties.PartitionOffset;
	});
		
	/* Iterate through the partition list and add them to the DOM */
	$.each(PartitionInterfaces, AddPartition);
	
	/* Iterate through the slaves and to some final preparations */
	$.each(PartitionSlavesElements, FinishPartitionTable);
	
	/* 
	 * Set-up GUI stuff 
	 * */

	/* Clicking on a partition shows information about it and updates the buttons */
	$(".partition").live("click",function()
	{
		$(".partition-selected").setActive(true);
		$(".freespace-selected").setActive(false);

		$(".partition").removeClass("selected");
		$(this).addClass("selected");
		
		var device = $(this).pData("device-object");
		if (device)
		{
			/* TODO: clean element before welding */
			$("#partitioner-sidebar").simpleweld(device.Properties);
		}
	});

	/* Clicking on free space causes the new partition button to be activated */
	$(".freespace").live("click",function()
	{
		$(".partition-selected").setActive(false);
		$(".freespace-selected").setActive(true);
	});
	
	/* Set the partition as a special Linvo partition */
	$("#set-partition").click(function()
	{
		var device = $(".selected").pData("device-object");
		//if (device.) Check free space
		
		install_point = device.Properties.DeviceMountPaths[0];

		$(".partition").removeClass("set-for-linvo");
		$(".selected").addClass("set-for-linvo");
	});


	/* 
	 * Start of the part of the interface responsible for actual modification of the
	 * partitions and the undo/redo (state) framework
	 * 
	 * */
	
	/* Undo/redo operations */	
	function StateObject(selected_slave_elem) /* Get an object describing a state of an element */
	{
		return {
			elem: selected_slave_elem, 
			state: selected_slave_elem.contents().removeClass("selected").clone()
		};
	}
	
	function SwitchState(SlaveState) /* Switch the state of an element to a state object */
	{ 
		SlaveState.elem.empty().append(SlaveState.state);
		UpdateStateButtons();
	}; 
	
	function UpdateStateButtons()
	{
		$("#redo-button").setActive(!(currentState == PartitionSlavesStates.length-1));
		$("#undo-button").setActive(!(currentState == -1));
	}
	
	$("#undo-button").click(function() { SwitchState(PartitionSlavesStates[currentState--].before); });
	$("#redo-button").click(function() { SwitchState(PartitionSlavesStates[++currentState].after); });
	/* End of undo/redo */
	
	/* Utility function to get a collection of a partition plus adjacent freespaces, if any */
	function GetPartitionWithFreespaces(partition_elem) 
	{
		return partition_elem.prev().filter(".freespace")
			.add(partition_elem) /* It's important that's in the middle so we keep the original order */
			.add(partition_elem.next().filter(".freespace"));
	}
	
	/* Define that upon click of a button, we bring up an action form */
	$("#manipulate-partitions-buttons > a").fancybox();
	
	/* What to do when "Apply" is clicked in an action form */
	$("#manipulate-partitions-forms > form").submit(function()
	{
		$.fancybox.close();
		
		var operation_id = $(this).attr("id");
		var selected_partition = $(".selected");
		var selected_slave_elem = selected_partition.parent();
			
		/* we have undone previous actions and now modify the table, meaning that there are already entries with n>currentState in the states array; clean them */
		if (PartitionSlavesStates.length-1 > currentState)
		{
			PartitionSlavesStates = PartitionSlavesStates.slice(0,currentState+1);
			UpdateStateButtons();
		}
		
		/* Save the state before the modification */
		var state_before = StateObject(selected_slave_elem);
		
		/* Modify the given slave */
		switch(operation_id)
		{
			case "add":
			{
				
			}
			break;
			
			case "remove":
			{
				var selected_partitions = GetPartitionWithFreespaces(selected_partition);
				
				selected_partitions.replaceWith(FreeSpaceElem()
					.pData("start", selected_partitions.first().pData("start"))
					.pData("end",selected_partitions.last().pData("end"))
					.width(selected_partitions.widthPercentage()+"%")
				);
			}
			break;
			
			case "format":
			{
				
			}
			break;
		
			case "resize":
			{
				
			}
			break;
		}
	
		/* We must save the state by saving the contents, not by cloning the element, because when restoring
		 * it, if we replace it with a clone, the references used in the PartitionSlavesElements will fail 
		 * and we will break UDisks hotplugging */
		PartitionSlavesStates.push({before: state_before, after: StateObject(selected_slave_elem), operation: 
				{
					type: operation_id,
					info: $(this).serializeArray(),
					dbus_interface: selected_partition.pData("device-object")
				}
		});/* Push the already modified state */
		
		currentState++; /* Notify that we've incremented the current state */
		UpdateStateButtons();
		
		/* Important to prevent refreshing the page */
		return false;
	});
		
	/* Just a test */
	for (path in PartitionSlavesElements)
		CalculateAuto(PartitionSlavesElements[path].elem, 10737418240);
}

function CalculateAuto(disk_elem, required_space)
{
	disk_elem.find(".partitions").children().each(function()
	{
	//	console.log("slot behind: "+$(this).pData("start"));
	
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

/* OBSOLETE CODE 
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
		var slave = $(".selected").parent().parent().pData("device-object");
		var start = selected_elem.pData("start");
		var end = selected_elem.pData("end");
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
		

	});	
*/
