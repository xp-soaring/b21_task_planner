// ********************************************************************************************
// *********  Manager for the airports data                ************************************
// ********************************************************************************************

class B21_Airports {

    constructor(planner, map) {
        this.AIRPORTS_JSON_URL = "https://xp-soaring.github.io/tasks/b21_task_planner/airports/airports.json";
        this.DEBUG_DRAW_MAP_BOXES = false;

        this.planner = planner;
        this.map = map;
        this.airports_data = null;
        this.available = false;
    }

    // init() will asynchronously download the airports data
    init() {
        fetch(this.AIRPORTS_JSON_URL).then(response => {
            if (!response.ok) {
                alert("Failed to download the airports data")
                return null;
            }
            //response.headers.set('content-type','application/json');
            return response.text();
        }).then( results => {
            console.log("airports.json loaded");
            this.airports_data = JSON.parse(results);
            this.available = true;
            this.draw();
        }).catch(error => {
            console.error('Network error accessing airports.json:', error);
        });
    }

    draw() {
        this.planner.airport_markers.clearLayers();

        if (!this.available) {
            console.log("draw_airports failed");
            return;
        }
        let zoom = this.map.getZoom();
        if ( zoom < 8) {
            console.log("Too zoomed out to display airports");
            return;
        }
        let map_bounds = this.map.getBounds();
        let map_box = { "min_lat": map_bounds.getSouth(),
                        "min_lng": map_bounds.getWest(),
                        "max_lat": map_bounds.getNorth(),
                        "max_lng": map_bounds.getEast()
        }
        console.log("draw_airports", map_box);
        const LAT = this.airports_data.airport_keys['lat'];
        const LNG = this.airports_data.airport_keys['lng'];
        const NAME = this.airports_data.airport_keys['name'];
        const IDENT = this.airports_data.airport_keys['ident'];
        const TYPE = this.airports_data.airport_keys['type']; //"closed_airport", "heliport", "large_airport", "medium_airport", "seaplane_base", "small_airport"
        const ALT_M = this.airports_data.airport_keys['alt_m'];
        const RUNWAYS = this.airports_data.airport_keys['runways'];
        for (let box_id in this.airports_data.box_coords) {
            let box = this.airports_data.box_coords[box_id];
            if (this.DEBUG_DRAW_MAP_BOXES) {
                L.rectangle([[box.min_lat,box.min_lng],[box.max_lat,box.max_lng]]).addTo(this.map);
            }
            if (this.box_overlap(box, map_box)) {
                //console.log("overlap",box_id, box);
                let airports = this.airports_data.boxes[box_id];
                for (let i=0; i<airports.length; i++) {
                    let airport = airports[i];
                    let type = airport[TYPE];
                    if (type.includes("airport")) {
                        let position = new L.latLng(airport[LAT], airport[LNG]);
                        let ident = airport[IDENT];
                        let type = airport[TYPE];
                        let name = airport[NAME].replaceAll('"',""); // Remove double quotes if original name includes those.
                        let alt_m = airport[ALT_M];
                        let runways = airport[RUNWAYS];
                        let circle_radius = 3 * (zoom - 7);
                        if (type=="large_airport") {
                            circle_radius *= 3;
                        } else if (type=="medium_airport") {
                            circle_radius *= 2;
                        }
                        let marker = L.circleMarker(position, {
                            renderer: this.planner.canvas_renderer,
                            color: this.planner.task.is_msfs_airport(type) ? '#3388ff' : '#33ff88',
                            radius: circle_radius
                        });
                        marker.addTo(this.planner.airport_markers);
                        marker.bindPopup(name+"<br/>"+type+"<br/>"+ident);
                        marker.on('mouseover', function(event){
                            marker.openPopup();
                        });
                        marker.on('mouseout', function(event){
                            marker.closePopup();
                        });
                        marker.on('click', (e) => {
                            console.log("User click:",ident,name);
                            this.planner.task.add_new_poi(position, type, {"ident": ident, "name": name, "alt_m": alt_m, "runways": runways});
                        });
                    }
                }
            }
        }
    }

    box_overlap(box, map_box) {
        if (map_box.min_lat > box.max_lat) {
            return false;
        }
        if (map_box.max_lat < box.min_lat) {
            return false;
        }
        if (map_box.min_lng > box.max_lng) {
            return false;
        }
        if (map_box.max_lng < box.min_lng) {
            return false;
        }
        return true;
    }

    // User has typed in search box
    //DEBUG pan the map to the clicked airport result, and highlight that airport
    search(search_value, results_el) {
        const RESULTS_MAX = 100;
        const TYPE = this.airports_data.airport_keys['type']; //"closed_airport", "heliport", "large_airport", "medium_airport", "seaplane_base", "small_airport"
        const NAME = this.airports_data.airport_keys['name'];
        const IDENT = this.airports_data.airport_keys['ident'];
        let results = [];
        for (let box_id in this.airports_data.box_coords) {
            let airports = this.airports_data.boxes[box_id];
            for (let i=0; i<airports.length; i++) {
                let airport = airports[i];
                let type = airport[TYPE];
                if (type.includes("airport")) {
                    let ident = airport[IDENT];
                    let name = airport[NAME].replaceAll('"',""); // Remove double quotes if original name includes those.
                    if ((ident+name).toLowerCase().includes(search_value)) {
                        results.push(airport);
                        if (results.length > RESULTS_MAX) {
                            break;
                        }
                    }
                }
            }
            if (results.length > RESULTS_MAX) {
                break;
            }
        }
        if (results.length>0) {
            while (results_el.firstChild) {
                results_el.removeChild(results_el.lastChild);
            }
            results_el.style.display = "block";
            for (let i=0;i<results.length;i++) {
                let airport = results[i];
                let result_el = document.createElement("div");
                result_el.className = "search_result";
                result_el.onclick = (e) => {
                    console.log("result "+i+" clicked", airport);
                }
                result_el.innerHTML = (airport[IDENT]+" "+airport[NAME]).replaceAll(" ","&nbsp;");
                results_el.appendChild(result_el);
            }
        }
        console.log("Search results", results.length);
    }

} // end class B21_Airports
