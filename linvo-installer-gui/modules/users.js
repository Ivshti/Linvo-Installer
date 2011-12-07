$(document).ready(function()
{
	$("#user-fullname").bind("input",function()
	{
		fullname = $(this).val();
		if (fullname)
		{
			$("#proposed-user").fadeIn();
			$("#proposed-username").html(fullname.split(" ")[0].toLowerCase());
			$("#user-password").css("background-color","#FFBABA");
			$("#user-password-status").html("Weak").css("color","#FF4573").show();
		}
		else
			$("#proposed-user").fadeOut();
		
	});
	
	$("#user-password-status").bind("input",function() {
		password = $(this).val();
		strength = password.length;
	
		$("#user-password-status").html("Weak").css("color","#FF4573").show();
			
	});
});

InstallerModules.users = 
{
	sidebar_entry : 
		{
			title: "Users", 
			icon: "icons/users.png" 
		},
	embed_to_home: "modules/users.html"
};
