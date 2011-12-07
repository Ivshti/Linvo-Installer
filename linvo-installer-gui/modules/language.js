/* TODO: NOTE: redo this using simpleweld and remove all static HTML */


InstallerModules.language = 
{
	embed_to_home: "modules/language.html",
	on_load: function()
	{
		var lang_split = navigator.language.split("-");
		var lang_linuxformat = lang_split[0]+"_"+lang_split[1].toUpperCase()+".utf8";
		
		if (lang_linuxformat in language_info)
			$("#current-language").text(language_info[lang_linuxformat].language);
	}
};

languages_elem = $("<div></div>");
$.each(language_info, function(index,info)
{
	/* TODO: scale text to fit */
	$("<div class='menulist-entry'>"+info.title+"</div>")
	.click(function()
	{
		console.log("blah");
		alert(index);
	})
	.appendTo(languages_elem);
});

$("#change-language").live("click",function()
{	
	$.fancybox(languages_elem.html(),
		{	
			autoDimensions: false,	
			width: 310,
			height: 450
		});
});

