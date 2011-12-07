<?php	
$zones = array();
$now = date_create();
foreach( timezone_identifiers_list() as $tz )
{
	$zone = timezone_open( $tz );

	$name = timezone_name_get( $zone );
	$location = timezone_location_get( $zone );
	$offset = timezone_offset_get( $zone, $now ) / 60; // convert seconds to minutes

	$zones[] = array('name' => $name, 'offset' => $offset, 'location' => $location);
}

echo "time_zone_info=".json_encode($zones);
?>
