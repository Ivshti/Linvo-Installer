/* TODO: NOTE: redo this using simpleweld and remove all static HTML */

InstallerModules.timezone = 
{
	embed_to_home: "modules/timezone.html"
};

time_zones_elem = $("<div></div>");
$.each(time_zone_info,function(index,info)
{
	$("<div class='menulist-entry'>"+info.name+"</div>")
	.appendTo(time_zones_elem);
});

$("#change-timezone").live("click",function()
{
	$.fancybox(time_zones_elem.html(),
	{	
		autoDimensions: false,	
		width: 310,
		height: 450
	});
});
