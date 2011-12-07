all: json-data

json-data: Makefile
	php tz.php > time-zone-info.js
	php lang.php "title;language;territory" > language-info.js

clean:
	rm time-zone-info.js
	rm language-info.js
