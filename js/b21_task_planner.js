"use strict"

class B21TaskPlanner {

    constructor() {
        this.M_TO_FEET = 3.28084;
        this.M_TO_MILES = 0.000621371;
    }

    init() {
        let parent = this;

        this.init_settings();

        this.init_drop_zone();

        this.init_map();

        // Task object to hold accumulated waypoints
        this.task = new Task(this);
    }

    init_map() {

        let parent = this;

        // Where you want to render the map.
        const element = document.getElementById('map');

        // Create Leaflet map on map element.
        this.map = L.map(element);

        this.tiles_outdoor = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiYjIxc29hcmluZyIsImEiOiJja3M0Z2o0ZWEyNjJ1MzFtcm5rYnAwbjJ6In0.frJxiv-ZUV8e2li7r4_3_A', {
            attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
            maxZoom: 18,
            id: 'mapbox/outdoors-v11',
            tileSize: 512,
            zoomOffset: -1,
            accessToken: 'pk.eyJ1IjoiYjIxc29hcmluZyIsImEiOiJja3M0Z2o0ZWEyNjJ1MzFtcm5rYnAwbjJ6In0.frJxiv-ZUV8e2li7r4_3_A'
        });

        this.tiles_outdoor.addTo(this.map);

        this.load_map_coords();

        // Set up the map mouse click callbacks
        this.map.on('click', (e) => {parent.map_left_click(parent, e);} );

        this.map.on('contextmenu', (e) => {parent.map_right_click(parent, e);} );

        this.map.on("moveend", () => {
            parent.save_map_coords(parent.map.getCenter(), parent.map.getZoom());
        });
    }

// ********************************************************************************************
// *********  Flight Plan handling                     ****************************************
// ********************************************************************************************

    init_drop_zone() {
        this.drop_zone_el = document.getElementById("drop_zone");
        this.drop_zone_el.style.display = "block";
        let parent = this;
        this.drop_zone_el.ondragover = (e) => {parent.dragover_handler(e); };
        this.drop_zone_el.ondrop = (e) => { parent.reset(); parent.drop_handler(parent, e); };
    }

    drop_handler(parent, ev) {
        console.log('File(s) dropped');
        // Prevent default behavior (Prevent file from being opened)
        ev.preventDefault();

        if (ev.dataTransfer.items) {
            // Use DataTransferItemList interface to access the file(s)
            for (var i = 0; i < ev.dataTransfer.items.length; i++) {
                // If dropped items aren't files, reject them
                if (ev.dataTransfer.items[i].kind === 'file') {
                    var file = ev.dataTransfer.items[i].getAsFile();
                    console.log('DataTransferItemList... file[' + i + '].name = ' + file.name);
                    let reader = new FileReader();
                    reader.onload = (e) => {
                        parent.handle_dropped_task_pln(e.target.result);
                    }
                    console.log("reader.readAsText",file);
                    reader.readAsText(file);
                }
            }
        } else {
            // Use DataTransfer interface to access the file(s)
            for (var i = 0; i < ev.dataTransfer.files.length; i++) {
                console.log('DataTransfer... file[' + i + '].name = ' + ev.dataTransfer.files[i].name);
                let reader = new FileReader();
                reader.addEventListener("load", (e) => {
                    parent.handle_dropped_task_pln(e.target.result);
                });
            	// event fired when file reading failed
            	reader.addEventListener('error', (e) => {
            	    alert('Error : Failed to read file');
            	});
                reader.readAsText(file);
            }
        }
    }

    handle_dropped_task_pln(file_str) {
        console.log("handle file");
        //console.log(file_str);
        const parser = new DOMParser();
        const dom = parser.parseFromString(file_str, "application/xml");
        let flight_plan_el = dom.getElementsByTagName("FlightPlan.FlightPlan")[0];
        let title = dom.getElementsByTagName("Title")[0].childNodes[0].nodeValue;
        // ***************************
        // Departure
        let departure = {};
        departure.id = dom.getElementsByTagName("DepartureID")[0].childNodes[0].nodeValue;
        // ***************************
        // Destination
        let destination = {};
        departure.id = dom.getElementsByTagName("DestinationID")[0].childNodes[0].nodeValue;
        // ***************************
        // Waypoints
        let dom_waypoints = dom.getElementsByTagName("ATCWaypoint"); //XMLNodeList
        for (let i=0; i<dom_waypoints.length; i++) {
            this.task.add_new_wp(null, dom_waypoints[i]);
        }
        this.map.fitBounds( [[this.task.min_lat, this.task.min_lng],[this.task.max_lat, this.task.max_lng]]);
    }

    dragover_handler(ev) {
        // Prevent default behavior (Prevent file from being opened)
        ev.preventDefault();
    }

// ********************************************************************************************
// *********  Persist map position and scale between sessions      ****************************
// ********************************************************************************************

    save_map_coords(center, zoom) {
        console.log(center.toString(), zoom);
        let move_obj = { lat: center.lat, lng: center.lng, zoom: zoom };
        let move_str = JSON.stringify(move_obj);
        localStorage.setItem("b21_task_planner_map_coords", move_str);
    }

    load_map_coords() {
        let move_str = localStorage.getItem("b21_task_planner_map_coords");
        console.log("load_map_coords", move_str);
        if (move_str == null | move_str == "undefined") {
            this.map.setView(new L.latLng(52.194748, 0.144295), 11);
            return;
        }
        let move_obj = {};
        try {
            move_obj = JSON.parse(move_str);
        } catch (e) {
            console.log("bad b21_task_planner_map_coords localStorage");
            return;
        }
        if (move_obj.lat == null || move_obj.lng == null ) {
            return;
        }

        this.map.setView(new L.latLng(move_obj.lat, move_obj.lng),move_obj.zoom);
    }

// ********************************************************************************************
// *********  Map click callbacks                      ****************************************
// ********************************************************************************************

    map_left_click(parent, e) {
        this.current_latlng = e.latlng;
        this.add_new_wp();
    }

    map_right_click(parent, e) {

        this.current_latlng = e.latlng; // Preserve 'current' latlng so page methods can use it

        let menu_str = '<div class="menu">';
        menu_str += parent.menuitem("Add WP", "add_wp");
        menu_str += parent.menuitem("Add Airport", "add_airport");
        menu_str += '</div>'; // end menu

        var popup = L.popup()
            .setLatLng(this.current_latlng)
            .setContent(menu_str)
            .openOn(parent.map);
    }

    menuitem(menu_str, menu_function_name) {
        return '<div onclick="b21_task_planner.'+menu_function_name+'()" class="menuitem">'+menu_str+'</div>';
    }

    add_new_wp() {
        console.log("add wp " + this.current_latlng);
        let wp = this.task.add_new_wp(this.current_latlng);

        this.map.closePopup();

        wp.request_alt_m();

        wp.display_menu();
    }

    // User has clicked on an existing WP and selected 'Add this WP to task'
    add_wp_to_task() {
        console.log("B21TaskPlanner add_wp_to_task()");
        this.task.append_current_wp_to_task();
    }

    add_airport() {
        console.log("add airport" + this.current_latlng);
    }

    change_wp_name(new_name) {
        console.log("new wp name = ",new_name);
        this.task.current_wp().set_name(new_name);
        this.task.display_task_list();
    }

    change_wp_icao(new_icao) {
        console.log("new wp icao = ",new_icao);
        this.task.current_wp().set_icao(new_icao);
        this.task.display_task_list();
    }

    change_wp_runway(runway) {
        console.log("new wp runway = ",runway);
        this.task.current_wp().set_runway(runway);
    }

    change_wp_alt(new_alt) {
        console.log("new wp alt = ",new_alt);
        this.task.current_wp().alt_m = parseFloat(new_alt) / (this.settings.altitude_units=="m" ? 1 : this.M_TO_FEET);
        this.task.display_task_list();
    }

    change_wp_radius(new_radius) {
        console.log("new wp radius = ",new_radius);
        this.task.current_wp().radius_m = parseFloat(new_radius) / (this.settings.wp_radius_units=="m" ? 1 : this.M_TO_FEET);
        this.task.display_task_list();
    }

    change_wp_max_alt(new_alt) {
        console.log("new wp max alt = ",new_alt);
        this.task.current_wp().max_alt_m = parseFloat(new_alt) / (this.settings.altitude_units=="m" ? 1 : this.M_TO_FEET);
        this.task.display_task_list();
    }

    change_wp_min_alt(new_alt) {
        console.log("new wp min alt = ",new_alt);
        this.task.current_wp().min_alt_m = parseFloat(new_alt) / (this.settings.altitude_units=="m" ? 1 : this.M_TO_FEET);
        this.task.display_task_list();
    }

    remove_wp_from_task() {
        console.log("remove WP from task", this.task.current_wp().get_name());
        this.task.remove_wp(this.task.index);
    }

    //DEBUG TODO implement WP database
    delete_wp_from_database() {
        console.log("delete WP from database", this.task.current_wp().get_name());
    }

    click_soaring_task_option(el) {
        console.log("click_soaring_task_option", el.checked);
        let option = el.checked;
        this.set_setting("soaring_task_option", option ? 1 : 0);
    }

    click_start() {
        let wp = this.task.current_wp();
        this.task.start_index = wp.index;
        if (this.task.finish_index <= wp.index) {
            this.task.finish_index = -1;
        }
        this.task.update_waypoint_icons();
        this.task.display_task_list();
    }

    click_finish() {
        let wp = this.task.current_wp();
        this.task.finish_index = wp.index;
        if (this.task.start_index >= wp.index) {
            this.task.start_index = -1;
        }
        this.task.update_waypoint_icons();
        this.task.display_task_list();
    }

// ********************************************************************************************
// *********  Page buttons                             ****************************************
// ********************************************************************************************

    // Clear the current task and start afresh
    reset() {
        this.task.reset();
    }

    //DEBUG implement flightplan download
    download() {
        console.log("download()");
    }

    update_elevations() {
        console.log("Update elevations");
        for (let i=0; i<this.task.waypoints.length; i++) {
            this.task.waypoints[i].request_alt_m();
        }
    }

    reset_map() {
        this.task.update_bounds();
        console.log( [[this.task.min_lat, this.task.min_lng],[this.task.max_lat, this.task.max_lng]]);
        this.map.fitBounds( [[this.task.min_lat, this.task.min_lng],[this.task.max_lat, this.task.max_lng]]);
    }

// ********************************************************************************************
// *********  Settings                                 ****************************************
// ********************************************************************************************

    init_settings() {

        this.settings = {};

        this.settings_values = {
            soaring_task_option: 1,                // 1 or 0 = true/false whether to embed the B21/ALBATROSS soaring params
            altitude_units: ["feet","m"],
            distance_units: ["km", "miles" ],
            wp_radius_units: ["m", "feet"],
            wp_radius_m:  500,
            wp_min_alt_m: 330,
            wp_max_alt_m: 2000
        };

        this.settings_el = document.getElementById("settings");
        this.settings_el.style.display = "none";
        this.settings_displayed = false;

        this.load_settings();

        this.build_settings_html();
    }

    toggle_settings() {
        console.log("toggle settings from",this.settings_displayed);
        if (this.settings_displayed) {
            this.close_settings();
        } else {
            this.settings_el.style.display = "block";
            this.settings_displayed = true;
        }
    }

    close_settings() {
        this.settings_el.style.display = "none";
        this.settings_displayed = false;
    }

    build_settings_html() {
        while (this.settings_el.firstChild) {
            this.settings_el.removeChild(this.settings_el.lastChild);
        }
        let heading_el = document.createElement("div");
        heading_el.id = "settings_heading";

        let heading_text_el = document.createElement("div");
        heading_text_el.id = "settings_heading_text";
        heading_text_el.innerHTML = "Settings";
        heading_el.appendChild(heading_text_el);

        let close_el = document.createElement("button");
        close_el.addEventListener("click", (e) => this.close_settings());
        close_el.innerHTML = "Close Settings";
        heading_el.appendChild(close_el);

        this.settings_el.appendChild(heading_el);

        for (const var_name in this.settings_values) {
            if (typeof this.settings_values[var_name]=="object") {
                this.build_setting_html(var_name);
            }
        }

    }

    build_setting_html(var_name) {
        let parent = this;
        let setting_el = document.createElement("div");
        setting_el.className = "setting";
        let setting_name_el = document.createElement("div");
        setting_name_el.className = "setting_name";
        setting_name_el.innerHTML = this.var_name_to_title(var_name);
        setting_el.appendChild(setting_name_el);
        if (typeof this.settings_values[var_name]=="object") {
            let setting_options_el = document.createElement("div");
            setting_options_el.className = "setting_options";
            for (let i=0; i<this.settings_values[var_name].length; i++) {
                let option_name = this.settings_values[var_name][i];
                let setting_option_el = document.createElement("div");
                setting_option_el.id = "setting_"+var_name+"_"+option_name;
                setting_option_el.className = "setting_option";
                setting_option_el.addEventListener("click", (e) => {
                    parent.unset_setting(var_name);
                    parent.select(e.target);
                    parent.set_setting(var_name, option_name);
                    parent.task.display_task_list();
                });
                setting_option_el.innerHTML = "Option: "+option_name;
                if (this.settings[var_name]==option_name) {
                    this.select(setting_option_el);
                }
                setting_options_el.appendChild(setting_option_el);
            }
            setting_el.appendChild(setting_options_el);
        }
        this.settings_el.appendChild(setting_el);
    }

    var_name_to_title(var_name) {
        let parts = var_name.split("_");
        let title = "";
        for (let i=0; i<parts.length; i++) {
            title += (i>0 ? " " : "") + parts[i][0].toUpperCase()+parts[i].slice(1);
        }
        return title;
    }

    set_altitude_units_m() {
        this.set_setting("altitude_units","m");
        this.task.display_task_list();
    }

    set_altitude_units_feet() {
        this.set_setting("altitude_units","feet");
        this.task.display_task_list();
    }

    select(el) {
        el.style.backgroundColor = "lightgreen";
    }

    unselect(el) {
        el.style.backgroundColor = "white";
    }

    unset_setting(var_name) {
        for (let i=0; i<this.settings_values[var_name].length; i++) {
            let option_name = this.settings_values[var_name][i];
            let id = "setting_"+var_name+"_"+option_name;
            this.unselect(document.getElementById(id));
        }
    }

    set_setting(var_name, value) {
        this.settings[var_name] = value;
        window.localStorage.setItem('b21_task_planner_'+var_name, ""+value);
    }

    get_setting(var_name) {
        let value = window.localStorage.getItem('b21_task_planner_'+var_name);
        let error = true;
        if (typeof this.settings_values[var_name] == "object") {
            console.log("get setting string", var_name);
            for (let i=0; i<this.settings_values[var_name].length; i++) {
                if (value == this.settings_values[var_name][i]) {
                    this.settings[var_name] = value;
                    error = false;
                    break;
                }
            }
            if (error) {
                this.settings[var_name] = this.settings_values[var_name][0];
            }
        } else {
            console.log("get setting value", var_name);
            this.settings[var_name] = parseFloat(value);
            if (isNaN(this.settings[var_name])) {
                console.log("get_setting default", var_name);
                this.settings[var_name] = this.settings_values[var_name];
            }
        }
        console.log("get_setting",this.settings[var_name]);
    }

    load_settings() {
        for (const var_name in this.settings_values) {
            this.get_setting(var_name);
        }
        if (this.settings.soaring_task_option==0) {
            document.getElementById("soaring_task_option_checkbox").checked = false;
        }
        console.log("load_settings",this.settings.altitude_units, this.settings.distance_units);
    }
}

// ******************************************************************************
// ***********   WP class (waypoint)       **************************************
// ******************************************************************************

class WP {

    // Waypoint may be created by a click on the map:
    //          new WP(planner, index, position)
    // or as a result of loading an MSFS flightplan:
    //          new WP(planner,index,null,WP_dom_object)
    //
    constructor(planner, index=null, position=null, dom_wp=null) {
        this.planner = planner; // reference to B21TaskPlanner instance
        if (dom_wp==null) {
            this.construct_new(index, position);
        } else {
            this.construct_from_dom(index, dom_wp);
        }
    }

    construct_new(index, position) {
        console.log("new WP", index, position, name);

        //DEBUG highlight start/finish waypoints
        //DEBUG offset waypoints according to bisector
        //DEBUG enter runway for departure airport

        this.name = null;
        this.position = position;
        this.icao = null;
        this.runway = null;
        this.alt_m = 0;
        this.radius_m = null;
        this.max_alt_m = null;
        this.min_alt_m = null;
        // turnpoint sector (Leaflet circle)
        this.sector = null;

        // Values from task
        // Note each 'leg_' value is TO this waypoint
        this.index = index;
        this.task_line = null;
        this.leg_bearing_deg = 0;   // Bearing from previous WP to this WP
        this.leg_distance_m = 0;    // Distance (meters) from previous WP to this WP
        this.marker = this.create_marker();
    }

    construct_from_dom(index, dom_wp) {
        let name = dom_wp.getAttribute("id");
        // <WorldPosition>N40° 40' 38.62",W77° 37' 36.71",+000813.00</WorldPosition>
        let world_position = dom_wp.getElementsByTagName("WorldPosition")[0].childNodes[0].nodeValue;
        let world_pos_elements = world_position.split(","); // lat, lng, alt
        let lat_elements = world_pos_elements[0].split(" ");
        let lat = parseInt(lat_elements[0].slice(1)) + parseFloat(lat_elements[1])/60 + parseFloat(lat_elements[2])/3600;
        lat = lat_elements[0][0]=="N" ? lat : -1 * lat;
        let lng_elements = world_pos_elements[1].split(" ");
        let lng = parseInt(lng_elements[0].slice(1)) + parseFloat(lng_elements[1])/60 + parseFloat(lng_elements[2])/3600;
        lng = lng_elements[0][0]=="E" ? lng : -1 * lng;

        let icao_codes = dom_wp.getElementsByTagName("ICAOIdent");
        let runways = dom_wp.getElementsByTagName("RunwayNumberFP");

        //DEBUG load departure and arrival airports from flight plan
        //BDEBUG load runway from flight plan
        console.log(world_position);
        this.construct_new(index,new L.latLng(lat,lng));

        this.name = name;
        this.alt_m = parseFloat(world_pos_elements[2]) / this.planner.M_TO_FEET;
        if (icao_codes.length>0) {
            this.icao = icao_codes[0].childNodes[0].nodeValue;
        }
        if (runways.length>0) {
            this.runway = runways[0].childNodes[0].nodeValue;
        }
    }

    create_marker() {
        let marker = L.marker( this.position,
                              { icon: this.get_icon(this.index),
                                draggable: true,
                                autoPan: true
        });
        let parent = this;
        marker.on("dragstart", function (e) {
            parent.planner.map.closePopup();
        });
        marker.on("drag", function(e) {
            let marker = e.target;
            parent.position = marker.getLatLng();
            parent.planner.task.update_waypoints();
            parent.planner.task.redraw();
            parent.planner.task.display_task_list();
        });
        marker.on("dragend", function (e) {
            parent.planner.task.set_current_wp(parent.index);
            console.log("WP dragend");
            let marker = e.target;
            parent.request_alt_m();
        });
        marker.on("click", function(e) {
            parent.wp_click(parent);
        });
        marker.addTo(this.planner.map);

        return marker;
    }

    wp_click(parent) {
        parent.planner.task.set_current_wp(parent.index);
    }

    get_icon() {
        let icon_str = (this.index.toFixed(0)+"."+this.get_name()).replaceAll(" ","&nbsp;");
        let icon_html = '<div class="wp_icon_html">'+icon_str+"</div>";

        let wp_icon = L.divIcon( {
            className: "wp_icon",
            html: icon_html
        } );

        return wp_icon;
    }

    request_alt_m() {
        let request_str = "https://api.open-elevation.com/api/v1/lookup?locations="+this.position.lat+","+this.position.lng;
        console.log(request_str);
        fetch(request_str).then(response => {
            if (!response.ok) {
                console.log("open-elevation.com fetch error");
                return null;
            }
            return response.json();
        }).then( results => {
            console.log("open-elevation.com:", results["results"][0]["elevation"]);
            this.alt_m = results["results"][0]["elevation"];
            this.display_menu();
            this.planner.task.display_task_list();
        }).catch(error => {
            console.error('Network error accessing open-elevation.com:', error);
        });
    }

    get_name() {
        if (this.name == null) {
            return "WP "+this.index;
        }
        return this.name;
    }

    set_name(name) {
        this.name = name;
        this.update_icon();
    }

    get_icao() {
        return this.icao==null ? "" : this.icao;
    }

    set_icao(icao) {
        this.icao = icao;
        this.update_icon();
    }

    get_runway() {
        return this.runway==null ? "" : this.runway;
    }

    set_runway(runway) {
        this.runway = runway;
    }

    update(prev_wp=null) {
        console.log("update",this.index);
        if (prev_wp != null) {
            this.update_leg_distance(prev_wp);
            this.update_leg_bearing(prev_wp);
        }
    }

    // Add .leg_distance_m property for distance (meters) from wp to this waypoint
    // Called when task is loaded
    update_leg_distance(prev_wp) {
        this.leg_distance_m = Geo.get_distance_m(this.position, prev_wp.position);
        console.log("update_leg_distance", this.index, this.leg_distance_m);
    }

    // Add .bearing property for INBOUND bearing FROM wp TO this waypoint
    // Called when task is loaded
    update_leg_bearing(prev_wp) {
        this.leg_bearing_deg = Geo.get_bearing_deg(prev_wp.position, this.position);
    }

    update_icon() {
        let icon = this.get_icon(this.index);
        this.marker.setIcon(icon);
    }

    display_menu() {
        let form_str = 'Name: <input onchange="b21_task_planner.change_wp_name(this.value)" value="'+this.get_name() + '"</input>';

        form_str += '<br/>ICAO: <input class="wp_icao" onchange="b21_task_planner.change_wp_icao(this.value)" value="' + this.get_icao() + '"</input> ';

        form_str += ' runway: <input class="wp_runway" onchange="b21_task_planner.change_wp_runway(this.value)" value="' + this.get_runway() + '"</input> ';

        let alt_str = this.alt_m.toFixed(0);
        let alt_units_str = "m.";
        if (this.planner.settings.altitude_units == "feet") {
            alt_str = (this.alt_m * this.planner.M_TO_FEET).toFixed(0);
            alt_units_str = "feet.";
        }

        form_str += '<br/>Elevation: <input class="wp_alt" onchange="b21_task_planner.change_wp_alt(this.value)" value="' + alt_str + '"</input> ' + alt_units_str;

        if (this.planner.settings.soaring_task_option==1) {
            let start = this.index == this.planner.task.start_index;
            form_str += '<br/>Start: <input onclick="b21_task_planner.click_start()" type="checkbox"'+(start ? " checked":"")+'/>';
            let finish = this.index == this.planner.task.finish_index;
            form_str += ' Finish: <input  onclick="b21_task_planner.click_finish()" type="checkbox"'+(finish ? " checked":"")+'/> ';
            let radius_units_str = "m";
            if (this.planner.settings.wp_radius_units=="feet") {
                radius_units_str = "feet";
            }
            let radius_str = "";
            if (this.radius_m != null) {
                if (this.planner.settings.wp_radius_units == "m") {
                    radius_str = this.radius_m.toFixed(0);
                } else {
                    radius_str = (this.radius_m * this.planner.M_TO_FEET).toFixed(0);
                }
            }
            form_str += ' Radius: <input class="wp_radius" onchange="b21_task_planner.change_wp_radius(this.value)" value="' + radius_str + '"</input> ' + radius_units_str;

            let max_alt_str = "";
            if (this.max_alt_m != null) {
                if (this.planner.settings.altitude_units == "m") {
                    max_alt_str = this.max_alt_m.toFixed(0);
                } else {
                    max_alt_str = (this.max_alt_m * this.planner.M_TO_FEET).toFixed(0);
                }
            }
            form_str += '<br/>Max Alt: <input class="wp_alt" onchange="b21_task_planner.change_wp_max_alt(this.value)" value="' + max_alt_str + '"</input> ';

            let min_alt_str = "";
            if (this.min_alt_m != null) {
                if (this.planner.settings.altitude_units == "m") {
                    min_alt_str = this.min_alt_m.toFixed(0);
                } else {
                    min_alt_str = (this.min_alt_m * this.planner.M_TO_FEET).toFixed(0);
                }
            }
            form_str += ' Min Alt: <input class="wp_alt" onchange="b21_task_planner.change_wp_min_alt(this.value)" value="' + min_alt_str + '"</input> ' + alt_units_str;
        }

        form_str += '<div class="menu">';
        form_str += this.planner.menuitem("Remove this WP from task","remove_wp_from_task");
        form_str += this.planner.menuitem("Add this WP to task","add_wp_to_task");
        form_str += this.planner.menuitem("Delete this WP from database","delete_wp_from_database");
        form_str += '</div>';
        var popup = L.popup({ offset: [0,0]})
            .setLatLng(this.position)
            .setContent(form_str)
            .openOn(this.planner.map);
    }

    copy(index) {
        let wp = new WP(this.planner, index, this.position);
        wp.name = this.name;
        wp.alt_m = this.alt_m;
        return wp;
    }
}

// ******************************************************************************
// ***********   Task class                **************************************
// ******************************************************************************

class Task {
    constructor(planner) {
        this.planner = planner; // Reference to B21TaskPlanner instance
        this.task_el = document.getElementById("task_list");
        this.init();
    }

    init() {
        this.waypoints = [];
        this.index = 0; // Index of current waypoint
        this.start_index = -1;
        this.finish_index = -1;
        this.task_distance_m = 123456;

        // task bounds
        this.min_lat = 90;
        this.min_lng = 180;
        this.max_lat = -90;
        this.max_lng = -180;
    }

    current_wp() {
        return this.waypoints[this.index];
    }

    get_task_distance_m() {
        let start_index = (this.start_index >= 0) ? this.start_index : 0;
        let finish_index = (this.finish_index >= 0 && this.finish_index < this.waypoints.length) ? this.finish_index : this.waypoints.length - 1;
        let distance_m = 0;
        for (let i=start_index+1; i<=finish_index; i++) {
            distance_m += this.waypoints[i].leg_distance_m;
        }
        return distance_m;
    }

    add_new_wp(position, dom_wp=null) {
        this.index = this.waypoints.length;
        console.log("task adding wp",this.index);
        let wp = new WP(this.planner, this.index, position, dom_wp);
        this.waypoints.push(wp);
        if (wp.index > 0) {
            this.add_line(this.waypoints[wp.index-1],wp);
        }
        this.update_bounds();
        this.update_waypoints();
        this.update_waypoint_icons();
        this.redraw();
        this.display_task_list();
        return wp;
    }

    append_current_wp_to_task() {
        let next_index = this.waypoints.length;
        console.log("task append existing wp",next_index);
        let wp = this.current_wp().copy(next_index);
        this.index = next_index;
        this.waypoints.push(wp);
        this.add_line(this.waypoints[wp.index-1],wp);
        this.update_waypoints();
        this.update_waypoint_icons();
        this.display_task_list();
        return wp;
    }

    // Update the .leg_distance_m for each waypoint around task
    update_waypoints() {
        console.log("update_waypoints");
        for (let i=0; i<this.waypoints.length; i++) {
            if (i > 0) {
                const wp = this.waypoints[i];
                const prev_wp = this.waypoints[i-1];
                wp.update(prev_wp);
            }
        }
    }

    update_waypoint_icons() {
        console.log("update_waypoint_icons");
        for (let i=0; i<this.waypoints.length; i++) {
            this.waypoints[i].update_icon();
        }
    }

    // Calculate the SW & NE corners of the task, so map can be zoomed to fit.
    update_bounds() {
        // task bounds
        this.min_lat = 90;
        this.min_lng = 180;
        this.max_lat = -90;
        this.max_lng = -180;
        for (let i=0; i<this.waypoints.length; i++) {
            let position = this.waypoints[i].position;
            console.log("update_bounds",i,position.lat, position.lng);
            if (position.lat<this.min_lat) {
                this.min_lat = position.lat;
            }
            if (position.lat>this.max_lat) {
                this.max_lat = position.lat;
            }
            if (position.lng<this.min_lng) {
                this.min_lng = position.lng;
            }
            if (position.lng>this.max_lng) {
                this.max_lng = position.lng;
            }
        }
        console.log("new map bounds ",this.min_lat, this.min_lng, this.max_lat, this.max_lng);
    }

    // Add a straight line between wp1 and wp2
    add_line(wp1, wp2) {
        let latlngs = [ wp1.position, wp2.position ];
        wp2.task_line = L.polyline(latlngs, {color: 'red'});
        wp2.task_line.addTo(this.planner.map);
    }

    add_sector(wp) {
        wp.sector = L.circle(wp.position, { radius: wp.radius_m, color: 'red', weight: 1 });
        wp.sector.addTo(this.planner.map);
    }

    redraw() {
        for (let i=0; i<this.waypoints.length; i++) {
            let wp = this.waypoints[i];
            // Set current WP marker to foreground
            if (i==this.index) {
                wp.marker.setZIndexOffset(1000);
            } else {
                wp.marker.setZIndexOffset(0);
            }
            // Draw task line
            if (wp.task_line != null) {
                wp.task_line.remove(this.planner.map);
                wp.task_line = null;
            }
            if (i>0) {
                this.add_line(this.waypoints[i-1], this.waypoints[i]);
            }
            // Draw WP circle
            if (wp.sector != null) {
                wp.sector.remove(this.planner.map);
                wp.sector = null;
            }
            if (wp.radius_m != null && wp.radius_m > 0) {
                this.add_sector(wp);
            }

        }
    }

    //DEBUG add total distance to task (recognise start/finish)
    display_task_list() {
        while (this.task_el.firstChild) {
            this.task_el.removeChild(this.task_el.lastChild);
        }
        let task_list_el = document.createElement("table");
        task_list_el.id = "task_list";
        for (let i=0; i<this.waypoints.length; i++) {
            this.display_task_waypoint(task_list_el, this.waypoints[i]);
        }
        this.task_el.appendChild(task_list_el);
        if (this.planner.settings.soaring_task_option==1) {
            let distance_units_str = "km";
            let distance_m = this.get_task_distance_m();
            let distance_str = (distance_m/1000).toFixed(1);
            if (this.planner.settings.distance_units=="miles") {
                distance_units_str = "miles";
                distance_str = (distance_m * this.planner.M_T_MILES).toFixed(1);
            }

            let distance_el = document.createElement("div");
            distance_el.id = "task_list_distance";
            distance_el.innerHTML = "Task distance: " + distance_str + " " + distance_units_str;

            this.task_el.appendChild(distance_el);
        }
    }

    display_task_waypoint(task_list_el, wp) {
        let wp_el = document.createElement("tr");
        wp_el.className = "task_list_wp";
        let parent = this;
        wp_el.onclick = function () { parent.set_current_wp(wp.index); };
        if (wp.index == this.index) {
            wp_el.style.backgroundColor = "yellow";
        }

        // Build elevation string
        let alt_str = wp.alt_m.toFixed(0);
        let alt_units_str = "m";
        if (this.planner.settings.altitude_units == "feet") {
            alt_str = (wp.alt_m * this.planner.M_TO_FEET).toFixed(0);
            alt_units_str = "feet";
        }
        // Build distance string
        let dist_str = "";
        let dist_units_str = "";
        if (wp.index>0) {
            if (this.planner.settings.distance_units == "miles") {
                dist_str = (wp.leg_distance_m * this.planner.M_TO_MILES).toFixed(1);
                dist_units_str = "miles";
            } else {
                dist_str = (wp.leg_distance_m / 1000).toFixed(1);
                dist_units_str = "km";
            }
        }
        let wp_index_el = document.createElement("td");
        wp_index_el.innerHTML = wp.index+1;
        wp_el.appendChild(wp_index_el);

        let wp_name_el = document.createElement("td");
        wp_name_el.innerHTML = wp.get_name();
        wp_el.appendChild(wp_name_el);

        let wp_alt_el = document.createElement("td");
        wp_alt_el.innerHTML = alt_str+" "+alt_units_str;
        wp_el.appendChild(wp_alt_el);

        let wp_dist_el = document.createElement("td");
        wp_dist_el.innerHTML = dist_str + " " + dist_units_str;
        wp_el.appendChild(wp_dist_el);

        task_list_el.appendChild(wp_el);
    }

    remove_wp_from_task(index) {
        console.log("remove_wp_from_task",index);
        let wp = this.waypoints[index];
        // remove line TO this waypoint
        if (index>0) {
            wp.task_line.remove(this.planner.map);
        }
        // remove line FROM this waypoint
        if (index<this.waypoints.length-1) {
            this.waypoints[index+1].task_line.remove(this.planner.map);
        }
        wp.marker.remove(this.planner.map);
        this.waypoints.splice(this.index,1);
        // Reset index values in waypoints
        for (let i=0; i<this.waypoints.length; i++) {
            this.waypoints[i].index = i;
        }
        // If we just deleted the last waypoint, we need to set current to new last WP
        if (this.index >= this.waypoints.length) {
            this.index = this.waypoints.length - 1;
        }
    }

    remove_wp(index) {
        this.remove_wp_from_task(index);
        this.update_waypoints();
        this.update_waypoint_icons();
        this.redraw();
        this.display_task_list();
        if (this.waypoints.length > 0) {
            this.current_wp().display_menu();
        } else {
            this.planner.map.closePopup();
        }

    }

    set_current_wp(index) {
        console.log("Set current WP index",index);
        this.index = index;
        this.update_waypoint_icons();
        this.redraw();
        this.current_wp().display_menu();
        this.display_task_list();
    }

    reset() {
        console.log("task.reset()");
        while (this.waypoints.length > 0) {
            this.remove_wp_from_task(this.waypoints.length - 1);
        }
        this.init();
        this.planner.map.closePopup();
        this.display_task_list();
    }

}
