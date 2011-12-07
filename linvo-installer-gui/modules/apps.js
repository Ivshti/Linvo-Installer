/* Potential bug: this data is updated only on live-cd build, which means 
 * people who customize the CD's are screwed
 * 
 * to be solved with the custom-building that will come to Linvo with the next release 
 * 
 * one of the solutions is to still use LinvoApp listing to find out any apps that don't have cached data for
 * in this case, we will use the LinvoAppServer API to try to retrieve their data
 * 
 * */

var EnabledApps = new Array();

$.each(applications.Application,function(index,app)
{
	EnabledApps.push(app["@attributes"].id);
	//console.log(app.CompressedSize);
	//console.log(app.UncompressedSize);
});

console.log(JSON.stringify(EnabledApps));

InstallerModules.apps = 
{
	sidebar_entry : 
	{
		title: "Applications", 
		icon: "icons/apps.png" 
	},
	fill_content : function(elem)
	{
		$.each(applications.Application,function(index,app)
		{
			app_elem = $("#application-template").clone().simpleweld(app).appendTo(elem);
			app_elem.find("img").attr("src","/"+app.IconPath);
		});
	},
	embed_to_templates: "modules/apps-templates.html"
};
