$.fn.timezone_picker = function (width, height, timezone_raw_data) 
{
	//Limit: 1116 850
	
	//Height: |1116-((x+78.5/180)*1116)|
	//Width: 1440*(y+180/360)
	
	//u−((42.41+90)÷180×u)
	//u > 1116
	this.addClass("tzpicker");
	this.css("width",width).css("height",height);
	//this.append("<div class='tzpicker-map'><div class='tzpicker-overlay'></div></div>");
	map = $("<div class='tzpicker-map'></div>").appendTo(this);
	overlay = $("<div class='tzpicker-overlay'></div>").appendTo(map);
	overlay.mousemove(function(e)
	{
		$(this).css("background-position",e.pageX+"px 0");
	});
	
	map.click(function(e) 
	{
	//	$(this).css("background-size",$(this).parent().height()*1.2+"px "+$(this).parent().width()*1.2+"px");
		//$(this).css("background-position",e.pageX+"px "+e.pageY+"px");
		$(this).ImageZoom();
	});
	
	$.each(timezone_raw_data.split("\n"),function(index, zoneline)
	{
		if (zoneline.substr(0,1) == "#")
			return;
			
		zoneentry = zoneline.split("\t");
		// 0: country code, 1: coordinates, 2: location, 3: description
		// 1: lenght - 11 (+/-DDMM+/-DDMM) or 15 (+/-DDMMSS+/-DDMMSS) 
		//alert(zoneentry[1].length);
		
		if (!zoneentry[1])
			return;
			
		if (zoneentry[1].length==11)
		{
			lat = parseInt(zoneentry[1].substr(1,2),10)+parseInt(zoneentry[1].substr(3,2),10)/60;
			len = parseInt(zoneentry[1].substr(6,3),10)+parseInt(zoneentry[1].substr(9,2),10)/60;
			// add sign
			lat = parseFloat(zoneentry[1].substr(0,1)+lat);
			len = parseFloat(zoneentry[1].substr(5,1)+len);
		}
		else if (zoneentry[1].length==15)
		{
			lat = parseInt(zoneentry[1].substr(1,2),10)+parseInt(zoneentry[1].substr(3,2),10)/60+parseInt(zoneentry[1].substr(5,2),10)/3600;
			len = parseInt(zoneentry[1].substr(8,3),10)+parseInt(zoneentry[1].substr(11,2),10)/60+parseInt(zoneentry[1].substr(13,2),10)/3600;
			
			// add sign
			lat = parseFloat(zoneentry[1].substr(0,1)+lat);
			len = parseFloat(zoneentry[1].substr(7,1)+len);
		}
		
		x = Math.round((len+180)/360*width);
		y = Math.round(height - ((lat+78.5)/180*height));

		$("<div class='tzpicker-marker'></div>").css("top",y+"px").css("left",x+"px").attr("title",zoneentry[2]).appendTo(map).click(function() { alert($(this).attr("title")+" "+$(this).css("left"));  });
	});
	
};
