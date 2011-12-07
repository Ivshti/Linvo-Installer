	/* Initialize installer modules */
	$.each(InstallerModules,function(index,mod)
	{
		/* Add the entry to the sidebar */
		if (mod.sidebar_entry)
		{
			$("#sidebar-item-template").clone().simpleweld(mod.sidebar_entry).appendTo("#bar")
			.click(GoToModule)/*.textfill({maxFontPixels: 13})*/
			.data("name",index)
			.find("img").attr("src",mod.sidebar_entry.icon);
		}
		
		/* Create a page for this module */
		var elem = $("<div id='page-"+index+"'></div>").appendTo("#config-module").hide();
		
		/* Embed HTML if the module wants */
		var embed_map =
		{
			embed_to_home: $("#home-modules-holder"),
			embed_to_templates: $("#templates"),
			page_template: elem
		};
		
		$.each(embed_map, function(embed_index,embed_to)
		{
			if (!mod[embed_index])
				return;
			
	  		xhttp=new XMLHttpRequest();
			xhttp.open("GET",mod[embed_index],false);
			xhttp.send();
			$(xhttp.responseText).appendTo(embed_to);
		});
		 
	
		/* And call it's functions */
		if (mod.fill_content)
			mod.fill_content(elem);
		
		if (mod.on_load)
			mod.on_load();
	});
