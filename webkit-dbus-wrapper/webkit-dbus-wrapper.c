/*
* Compile:
*   gcc -o jscorebus-webkit jscorebus-webkit.c $(pkg-config --cflags --libs gtk+-3.0 dbus-glib-1 webkitgtk-3.0 jscorebus)
* 	gcc -o jscorebus-webkit jscorebus-webkit.c $(pkg-config --cflags --libs dbus-glib-1 webkit-1.0 unique-1.0 jscorebus)
*
* TODO:
* > set WebKit settings from command line
* #> set window resizeable from command line
* > title (from command line and gtk+)
* #> unique: one app at a time
* > port to GTK+3
* #> translations
* > --preload= argument that points to an executable
* #> while loading (executing preload script and waiting for document ready), a loading bar can be introduced in the center of the window; this can simply be another webkit object
* > "data providers" (read from files from recursively walking a folder): use the x:// notation to retrieve JavaScript code that inserts data into your app; alternatively, scripts can be directly injected
* > --icon= to set the window icon
*/

#include <libintl.h>
#include <locale.h>
#include <dbus/dbus.h>
#include <dbus/dbus-glib-lowlevel.h>
#include <webkit/webkit.h>
#include <JavaScriptCore/JavaScript.h>
#include <jscorebus/jscorebus.h>
#include <stdlib.h>
#include <gtk/gtk.h>
#include <unique/unique.h>
#include <glib/gi18n.h>

#define LOADING_HTML "loading.html"

/* Command line options */
gint window_width = 0;
gint window_height = 0;
gboolean window_resizeable = TRUE;
gboolean translate_dom = TRUE;
gchar* window_title = "Web app";
gchar* app_id = "BrowserDbusApp";

static GOptionEntry entries[] =
{
	{ "width", 'w', 0, G_OPTION_ARG_INT, &window_width, "Window width", NULL },
	{ "height", 'h', 0, G_OPTION_ARG_INT, &window_height, "Window height", NULL },
	{ "resizeable", 'r', 0, G_OPTION_ARG_INT, &window_resizeable, "Window resizeable", NULL },
	{ "title", 't', 0, G_OPTION_ARG_STRING, &window_title, "Window title", NULL },
	{ "app-id", 'i', 0, G_OPTION_ARG_STRING, &app_id, "Application ID (no whitespaces or special characters). It's used for instance control and as the localization domain.", NULL },
	{ "translate-dom", 't', 0, G_OPTION_ARG_INT, &translate_dom, "Translate the DOM tree of the loaded HTML file on document ready (defaults to true)."},
	{ NULL }
};


/* GTK+ window handling */
GtkWidget *view;
GtkWidget *view_loading;
GtkWidget *swin;

static
void _window_object_cleared (WebKitWebView* web_view,
WebKitWebFrame* frame,
JSGlobalContextRef context,
JSObjectRef windowObject,
gpointer user_data)
{
jscorebus_export(context);
}

static gboolean
_window_delete_event(GtkWidget *widget, GdkEvent  *event, gpointer user_data)
{
	gtk_widget_destroy(widget);
	gtk_main_quit();
	return TRUE;
}

/* This runner will translate all the text nodes in the loaded DOM using gettext, and also the specified attributes */
gchar* translated_attributes[] = {"title"};
/* Given a DOM root node, we will localize all the text inside it */
void localize_text_subnodes(WebKitDOMNode* root)
{
	WebKitDOMNodeList* list = webkit_dom_node_get_child_nodes(root);
	gulong length = webkit_dom_node_list_get_length(list);

	int i;
    for (i = 0; i < length; i++)
    {
		WebKitDOMNode* node = webkit_dom_node_list_item(list, i);
		int node_type = webkit_dom_node_get_node_type(node);
		
		if (node_type == 3)
		{
			gchar* node_text = webkit_dom_html_element_get_inner_text((WebKitDOMHTMLElement*)node);
			
			/* We don't want to process empty or newline nodes */
			if (! g_strcmp0(g_strstrip(node_text),"") == 0)
				webkit_dom_node_set_text_content(node,_(node_text),NULL);
		}
		else
			localize_text_subnodes(node);
	}
	
	WebKitDOMNamedNodeMap* attrs = webkit_dom_node_get_attributes(root); 
	if (attrs)
	{
		for (i=0; i!=sizeof(translated_attributes)/sizeof(translated_attributes[0]); i++)
		{
			WebKitDOMAttr* attr = (WebKitDOMAttr*) webkit_dom_named_node_map_get_named_item(attrs,translated_attributes[i]);
			if (attr)
				webkit_dom_attr_set_value(attr,_(webkit_dom_attr_get_value(attr)),NULL);
		}
	}
}

void on_app_load()
{
	/* Replace the loading widget if it exists */
	if (view_loading)
	{
		gtk_container_remove(GTK_CONTAINER(swin), view_loading);
		gtk_container_add(GTK_CONTAINER(swin), view);
		gtk_widget_show(view);
	}
	
	/* begin translation code */
	if (translate_dom)
	{
		WebKitDOMDocument* document = webkit_web_view_get_dom_document(WEBKIT_WEB_VIEW(view));
		WebKitDOMNodeList* tmplist = webkit_dom_document_get_elements_by_tag_name(document,"body");
		localize_text_subnodes(webkit_dom_node_list_item(tmplist,0));
	}
}

#ifdef GTK3_GTKAPPLICATION
static void
activate (GtkApplication *app)
{
	GList *list;
	GtkWidget *window;

	list = gtk_application_get_windows (app);

	if (list)
	{
		gtk_window_present (GTK_WINDOW (list->data));
		exit(0);
	}   
}
#endif

int main(int argc, char *argv[])
{	
	GtkWidget *window;
	DBusConnection *session_connection;
	DBusConnection *system_connection;
	GError *error = NULL;
	GOptionContext *context;

	context = g_option_context_new ("- Start a web application through WebKit with a DBus object attached to JavaScript so you can communicate with the system.");
	g_option_context_add_main_entries (context, entries,/*GETTEXT_PACKAGE*/app_id);
	g_option_context_add_group (context, gtk_get_option_group(TRUE));
	if (!g_option_context_parse (context, &argc, &argv, &error))
	{
		g_print("option parsing failed: %s\n", error->message);
		exit(1);
	}

	//g_thread_init(NULL);
	gtk_init(&argc, &argv);
	
	/* It's important that's after gtk_init */
	bindtextdomain(app_id, "/usr/share/locale" );
	bind_textdomain_codeset(app_id, "UTF-8");
	textdomain(app_id);
	
	/* Set up the "loading" frame */
	if (g_file_test(LOADING_HTML,G_FILE_TEST_EXISTS))
	{
		view_loading = webkit_web_view_new();
		webkit_web_view_open(WEBKIT_WEB_VIEW(view_loading), g_strjoin("/", "file://", g_get_current_dir(), LOADING_HTML, NULL));
	}

	/* Set-up JSCore */
	session_connection = dbus_bus_get(DBUS_BUS_SESSION, NULL);
	system_connection = dbus_bus_get(DBUS_BUS_SYSTEM, NULL);

	dbus_connection_setup_with_g_main(session_connection, NULL);
	dbus_connection_setup_with_g_main(system_connection, NULL);

	jscorebus_init(session_connection, system_connection);

	/* Set-up GTK+ window and WebKit view */
	window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
	
	/* Ensure app uniqueness */
	#ifdef GTK3_GTKAPPLICATION /* to be fixed */
		GtkApplication *app;
		app = gtk_application_new(g_strconcat("org.gtk.",app_id,NULL), 0);
		g_signal_connect(app, "activate", G_CALLBACK (activate), NULL);
		g_application_run(G_APPLICATION(app),argc, argv);
	#else
		UniqueApp* app;
		app = unique_app_new (g_strconcat("org.gtk.",app_id,NULL), NULL);

		if (unique_app_is_running (app))
		{
			UniqueResponse response;
			response = unique_app_send_message (app, UNIQUE_ACTIVATE, NULL);
			g_object_unref (app);
			return response == UNIQUE_RESPONSE_OK ? 0 : 1;
		}
		
		unique_app_watch_window (app, GTK_WINDOW (window));
	#endif
	
	/* Set-up the window */
	gtk_window_set_resizable((GtkWindow*)window,window_resizeable);
	gtk_window_set_title((GtkWindow*)window,window_title);
	
	swin = gtk_scrolled_window_new(NULL, NULL);
	view = webkit_web_view_new();

	if (view_loading)
		gtk_container_add(GTK_CONTAINER(swin), view_loading);
	else
		gtk_container_add(GTK_CONTAINER(swin), view);

	// Disable right-click menu 
	WebKitWebSettings *settings = webkit_web_view_get_settings(WEBKIT_WEB_VIEW(view));
	g_object_set(G_OBJECT(settings), "enable-default-context-menu", FALSE, NULL);
	g_object_set(G_OBJECT(settings), "enable-universal-access-from-file-uris", TRUE, NULL); //and enable file:// URI access

	// Add to GTK+ container
	gtk_container_add(GTK_CONTAINER(window), swin);

	g_signal_connect(window, "delete-event", G_CALLBACK(_window_delete_event), NULL);

	/*
	* Connect to the window-object-cleared signal. This is the moment when we
	* need to install the D-Bus bindings into the DOM.
	*/
	g_signal_connect(view, "window-object-cleared",G_CALLBACK(_window_object_cleared), session_connection);
	/* connect the on-load event, hiding the loading bar */
	g_signal_connect(view, "onload-event", G_CALLBACK(on_app_load),NULL);

	if (g_str_has_prefix("http://", argv[1])
	|| g_str_has_prefix("https://", argv[1])
	|| g_str_has_prefix("file://", argv[1]))
		webkit_web_view_open(WEBKIT_WEB_VIEW(view), argv[1]);
	else 
	{
		gchar *url = NULL;
		if (g_path_is_absolute(argv[1]))
			url = g_strjoin("", "file://", argv[1], NULL);
		else
		{
			gchar *pwd = g_get_current_dir();
			url = g_strjoin("/", "file://", pwd, argv[1], NULL);
			g_free(pwd);
		}
		webkit_web_view_open(WEBKIT_WEB_VIEW(view), url);
		g_free(url);
	}

	gtk_widget_set_size_request(window,
		(window_width ? window_width : 640),
		(window_height ? window_height : 480)
	);
	gtk_widget_show_all(window);
	gtk_main();

	return 0;
}
