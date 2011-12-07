/*
TODO: easy rebranding, external string configuration, import/export from a dbus module

GUI: 
#> sidebar, load data
> on the overlay background, don't snap the highlighter to the other end
> zoom/unzoom on time zones; load timezones properly
#> helpbar
> fill helpbar somehow
	#>disable text selection?
	> but allow it for some texts?

> maybe it would look better if text fields were square
> change the "install" button to "next" button if some action is required (e.g. in manual mode); also maybe pernamently show bar
> if GNOME 3 buttons stay good on this, remove the jquery-based button styles
> scale text, resize text container when scrolling bar
> fix the stupid bar..again
#> modules framework
> adapt underscore/backbone/knockout for some stuff http://www.elated.com/articles/5-javascript-libraries-youll-love/
> remove the linvo-installer-dbus/linvo-installer-gui seperation and make one file to handle the general module structure
> change title upon changing mode
* “Click this button to {start installing/upgrade} Linvo now. That is all you need, and of course, all the data on this computer will be preserved. Depending on your level of expertise, you may 
* use the other part of the interface to configure your installation;; at any time, even while it's under progress or after it's complete."
* #> upon sliding the space allocation bar, make the space number rise exponentially
> include help docs
!!! > fix the font in webkit
http://wijmo.com/ this can later be used
* 
other:
#> seperate out the GUI stuff (images, css, html) and code (JS) into two
> rebrand to SOSI - simple operating system installer

*/

var InstallerModules = new Object();

function ScrollTo(elem) { $("body").stop().animate({scrollLeft: elem.offset().left}, 1000); };
function ShowBar() { ScrollTo($("#bar")); }
function HideBar() { ScrollTo($("#bar-pull")); }
function SetupBar() { $("#bar-pull, #bar").mouseenter(ShowBar).mouseleave(HideBar); }
	
ToggleBar.bar_shown = false;
function ToggleBar()
{
	if (ToggleBar.bar_shown)
		HideBar();
	else
		ShowBar();
		
	ToggleBar.bar_shown = !ToggleBar.bar_shown;
}

/* Configuration modules */
function GoToModule()
{
	$("#config-module").children().filter("div").hide();
	$("#page-"+$(this).data("name")).show();
	$("#bar-pull, #bar").unbind("mouseleave",HideBar).unbind("mouseover",ShowBar);
	ScrollTo($("#config-module"));
}
	
function setupGUI()
{
	$("#help-box").toggle(
		function()
		{
			$(this).animate({height: 100});
			$(this).find("img").css("-webkit-transform","rotate(-180deg)");
		}, 
		function()
		{
			$(this).animate({height: 30});
			$(this).find("img").css("-webkit-transform","none");
		}
	);
	
	SetupBar();	
	$("#back-to-home").click(function()
	{
		ScrollTo($("#bar-pull"));
		SetupBar(); //this was unbinded, needs to be re-setup
	});
	$("body").scrollLeft($("#bar-pull").offset().left);


	$("#install-button").click(function()
	{
		$.fancybox("<div id='progress-bar'></div>",
			{
				autoDimensions: false,
				width: 400,
				height: 40
			}
		);
	});

	$("input[name='partition-type']").change(function()
	{
		if ($(this).value == "Manual" /* && partitions.configured == false; */)
		{
			$("#install-button").hide();
			$("#next-button").show();
		}
	});

	$("#space-slider").change(function()
	{
		var slider_val = $(this).val();
		var exponent = slider_val/100;
		$("#space-allocated").html(parseInt(Math.pow(10,exponent)));
	});
	
	
	/* Initialize GUI libraries */
	$("button").button();
	$("select, input:radio, input:file, input:checkbox").uniform();
	$("img[title]").tooltip();

};

$(document).ready(setupGUI);
