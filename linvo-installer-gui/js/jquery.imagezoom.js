/*
jquery.imagezoom.js v0.1
Last updated: 03 May 2010

Created by Paulo Cheque
Contact: paulocheque@gmail.com

Licensed under a Creative Commons Attribution-Non-Commercial 3.0 Unported License
http://creativecommons.org/licenses/by-nc/3.0/

Example of Usage:

// Default values: { zoom: 10, speed_hover: 100, speed_unhover: 100, unit: 'px', }
$('img').ImageZoom();

// Custom values
$('img').ImageZoom({ zoom: 15, speed_hover: 100, speed_unhover: 200, unit: 'px' });
*/

(function($) {

	$.fn.ImageZoom = function(options) {
		var properties = $.extend({}, $.fn.ImageZoom.defaults, options);

		function img_hover(x) {
			$(this).css({'z-index' : '9999'});
			$(this).addClass("imagezoom_hover").stop().animate({
					top:  properties.topleft,
					left: properties.topleft,
					width: (parseInt($(this).attr('original_width')) + parseInt(properties.zoom)) + properties.unit,
					height: (parseInt($(this).attr('original_height')) + parseInt(properties.zoom)) + properties.unit,
				}, properties.speed_hover);
		}
	
		function img_unhover() {
			$(this).css({'z-index' : '0'});
			$(this).removeClass("imagezoom_hover").stop().animate({
					top: '0px',
					left: '0px',
					width: $(this).attr('original_width') + properties.unit,
					height: $(this).attr('original_height') + properties.unit,
				}, properties.speed_unhover);
		}
		
        return this.each(function(index) {
        	image = $(this);
        	image.css({'position' : 'relative'});
        	image.attr('original_width', $(this).attr('width'));
        	image.attr('original_height', $(this).attr('height'));
        	
        	properties.topleft = (- parseInt(properties.zoom) / 2) + properties.unit;

        	image.hover(img_hover, img_unhover);
        });

    }; 
    
	$.fn.ImageZoom.defaults = {
		zoom: 5,
		speed_hover: 100,
		speed_unhover: 100,
		unit: 'px',
	};
    
})(jQuery);
