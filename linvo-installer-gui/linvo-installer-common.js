function ErrorMessage(error_elem)
{
	$.fancybox($(error_elem).html(),
	{
				"autoDimensions"	: false,
				"width"         		: 280,
				"height"        		: 320,
				"hideOnOverlayClick" : false,
				"showCloseButton"	: false
	});
}
