<?php

if ($argv[1])
	$filter = explode(";",$argv[1]);


function startsWith($haystack, $needle)
{
    $length = strlen($needle);
    return (substr($haystack, 0, $length) === $needle);
}

function endsWith($haystack, $needle)
{
    $length = strlen($needle);
    $start  = $length * -1; //negative
    return (substr($haystack, $start) === $needle);
}

$languages = array();
$recordIn = 0;
$handle = popen("/usr/bin/locale -cva", "r");
$lastname = "";

while($line = fgets($handle))
{
	if (startsWith($line,"locale:"))
	{
		/* push the last-recorded element, if any */
		if ($recordIn)
			$languages[$lastname] = $recordIn;

		$expd_line = explode(" ",$line);
		$locale = $expd_line[1];

		if (endsWith($locale,".utf8"))
		{
			$recordIn = array();
			$lastname = $locale;
		}
		else
			$recordIn=0;
	}
	else if (gettype($recordIn)=="array")
	{
		$expd_line = explode("|",$line);
		if (count($expd_line) > 1 && (!isset($filter) || in_array(trim($expd_line[0]),$filter)))
			$recordIn[trim($expd_line[0])] = trim($expd_line[1]);
	}
}
/* push the last element, if any */
if ($recordIn)
	$languages[$lastname] = $recordIn;
			
pclose($handle);

echo "language_info=".json_encode($languages);
?>
