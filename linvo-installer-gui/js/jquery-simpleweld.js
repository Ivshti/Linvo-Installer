/*
 * SimpleWeld jQuery plug-in
 * similar to Weld.JS
 * 
 * but works with clone()-d elements and not as complex
 * 
 * The recommended usage if you need to map a simple JSON structure 
 * to one DIV element only, and not if you need full templating alternative (in this case, use Weld.JS)
 * 
 */

function simpleweld(element,data,config)
{
	if (!config)
		config = Object(); //dummy object
		
	$.each(data,function(index,value)
	{
		if (config[index])
			value = config[index];
		
		if (index=="@attributes")
		{	
			for (var key in value)
				$(element).attr(config[key] ? config[key] : key,value[key]);
				
			return;
		}
						
		subelement = $(element).find("."+index);
		if (!subelement.length>0)
			subelement = $(element).find("#"+index);
		
		if (!subelement.length>0)
			return;
				
		if (typeof(value)=="string")
			$(subelement).html(value);
		else if (typeof(value) == "object")
			simpleweld(subelement,value,config);
		
	});
}

$.fn.simpleweld = function (data, config) {
  return this.each (function () 
  {
    $(this).removeAttr("id");
    simpleweld(this, data, config);
  });
};
