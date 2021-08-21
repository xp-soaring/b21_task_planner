#!/usr/bin/env python3

""" airports.csv

2021-08-21 = 66941 entries (624 large_airport)

Each row in this dataset represents the record for a single airport. The primary key for interoperability purposes with other datasets is ident,
but the actual internal OurAirports primary key is id. iso_region is a foreign key into the regions.csv download file.

Column	    Sample value	Description
id          2434	Internal OurAirports integer identifier for the airport. This will stay persistent, even if the airport code changes.
ident       EGLL	The text identifier used in the OurAirports URL. This will be the ICAO code if available. Otherwise, it will be a local airport code (if no conflict), or if nothing else is available, an internally-generated code starting with the ISO2 country code, followed by a dash and a four-digit number.
type        large_airport	The type of the airport. Allowed values are "closed_airport", "heliport", "large_airport", "medium_airport", "seaplane_base", and "small_airport". See the map legend for a definition of each type.
name	    London Heathrow Airport	The official airport name, including "Airport", "Airstrip", etc.
latitude_deg    51.470600	The airport latitude in decimal degrees (positive for north).
longitude_deg	-0.461941	The airport longitude in decimal degrees (positive for east).
elevation_ft	83	The airport elevation MSL in feet (not metres).
continent	EU	The code for the continent where the airport is (primarily) located. Allowed values are "AF" (Africa), "AN" (Antarctica), "AS" (Asia), "EU" (Europe), "NA" (North America), "OC" (Oceania), or "SA" (South America).
iso_country	GB	The two-character ISO 3166:1-alpha2 code for the country where the airport is (primarily) located. A handful of unofficial, non-ISO codes are also in use, such as "XK" for Kosovo. Points to the code column in countries.csv.
iso_region	GB-ENG	An alphanumeric code for the high-level administrative subdivision of a country where the airport is primarily located (e.g. province, governorate), prefixed by the ISO2 country code and a hyphen. OurAirports uses ISO 3166:2 codes whenever possible, preferring higher administrative levels, but also includes some custom codes. See the documentation for regions.csv.
municipality	London	The primary municipality that the airport serves (when available). Note that this is not necessarily the municipality where the airport is physically located.
scheduled_service	yes	"yes" if the airport currently has scheduled airline service; "no" otherwise.
gps_code	EGLL	The code that an aviation GPS database (such as Jeppesen's or Garmin's) would normally use for the airport. This will always be the ICAO code if one exists. Note that, unlike the ident column, this is not guaranteed to be globally unique.
iata_code	LHR	The three-letter IATA code for the airport (if it has one).
local_code		The local country code for the airport, if different from the gps_code and iata_code fields (used mainly for US airports).
home_link	http://www.heathrowairport.com/	URL of the airport's official home page on the web, if one exists.
wikipedia_link	https://en.wikipedia.org/wiki/Heathrow_Airport	URL of the airport's page on Wikipedia, if one exists.
keywords	LON, Londres	Extra keywords/phrases to assist with search, comma-separated. May include former names for the airport, alternate codes, names in other languages, nearby tourist destinations, etc.
"""

import csv
import math

IDENT = 1
TYPE = 2
NAME = 3
LAT = 4
LNG = 5
ELEVATION = 6

M_TO_FEET = 3.28084

AIRPORTS = {}
MAX_AIRPORTS_PER_BOX = 1000

def main():
    airports = [];
    with open('airports.csv') as csvfile:
        reader = csv.reader(csvfile)
        for row in reader:
            airport = { 'lat': float(row[LAT]),
                        'lng': float(row[LNG]),
                        'name': row[NAME],
                        'type': row[TYPE],
                        'alt_m': 0 if row[ELEVATION]=='' else float(row[ELEVATION]) / M_TO_FEET
            }
            airports.append(airport)

    shred(airports,"lng", "", { 'min_lat': -90, 'min_lng': -180, 'max_lat': 90, 'max_lng': 180} )
    for key in AIRPORTS:
        print(key, AIRPORTS[key]['box'], len(AIRPORTS[key]['airports']))

def shred(airports, latlng, index, box_coords):
    if len(airports) <= MAX_AIRPORTS_PER_BOX:
        AIRPORTS[index] = { 'box': box_coords, 'airports': airports }
    else:
        airports.sort(key=lambda airport: airport[latlng])
        mid = math.floor(len(airports)/2)
        if latlng=='lat':
            coords0 = { 'min_lat': box_coords['min_lat'], 'max_lat': airports[mid-1]['lat'],
                        'min_lng': box_coords['min_lng'], 'max_lng': box_coords['max_lng'] }
            coords1 = { 'min_lat': airports[mid]['lat'],  'max_lat': box_coords['max_lat'],
                        'min_lng': box_coords['min_lng'], 'max_lng': box_coords['max_lng'] }
        else:
            coords0 = { 'min_lat': box_coords['min_lat'], 'max_lat': box_coords['max_lat'],
                        'min_lng': box_coords['min_lng'], 'max_lng': airports[mid-1]['lng'] }
            coords1 = { 'min_lat': box_coords['min_lat'], 'max_lat': box_coords['max_lat'],
                        'min_lng': airports[mid]['lng'],  'max_lng': box_coords['max_lng'] }

        box0 = airports[0:mid]
        box1 = airports[mid:]

        shred(box0, 'lat' if latlng=='lng' else 'lng', index+"0", coords0)
        shred(box1, 'lat' if latlng=='lng' else 'lng', index+"1", coords1)



if __name__=="__main__":
    main()
