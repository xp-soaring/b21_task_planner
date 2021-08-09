"use strict"

class B21TaskPlanner {

    constructor() {
    }

    init() {
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

        // Target's GPS coordinates.
        const target = L.latLng(52, 0);

        // Set map's center to target with zoom 14.
        this.map.setView(target, 11);

        this.map.on('contextmenu', (e) => {parent.map_right_click(parent, e);} );

        // Task object to hold accumulated waypoints
        this.task = new Task(this);
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
        return '<div onclick="menuitem('+"'"+menu_function_name+"'"+')" class="menuitem">'+menu_str+'</div>';
    }

    add_wp() {
        console.log("add wp " + this.current_latlng);
        let marker = L.marker(this.current_latlng,
                              { draggable: true,
                                autoPan: true
        });
        let wp = this.task.add_wp(marker);

        let parent = this;
        marker.on("drag", function(e) {
            let marker = e.target;
            wp.latlng = marker.getLatLng();
            parent.task.redraw();
        });
        marker.on("dragend", function (e) {
            let marker = e.target;
            wp.get_alt_m();
        });
        marker.addTo(this.map);
        this.map.closePopup();

        wp.get_alt_m();

        wp.display_form();
    }

    add_airport() {
        console.log("add airport" + this.current_latlng);
    }

    change_wp_name(new_name) {
        console.log("new wp name = ",new_name);
        this.task.current_wp().name = new_name;
        this.task.display_task_list();
    }

    change_wp_alt(new_alt) {
        console.log("new wp alt = ",new_alt);
        this.task.current_wp().alt_m = parseFloat(new_alt);
        this.task.display_task_list();
    }

    delete_wp() {
        console.log("delete WP", this.task.current_wp().name);
        this.task.remove_current();
    }
}

// ******************************************************************************
// ***********   WP class                  **************************************
// ******************************************************************************

class WP {
    constructor(planner, marker, index) {
        this.planner = planner; // reference to B21TaskPlanner instance
        this.marker = marker;
        this.index = index;
        let parent = this;
        marker.on("click", function(e) {
            parent.planner.task.index = index;
            parent.display_form();
            parent.planner.task.display_task_list(); // update highlight of current WP
        });
        this.name = "WP "+index;
        this.latlng = marker.getLatLng();
        this.alt_m = 123;
        this.task_line = null;
    }

    get_alt_m() {
        let request_str = "https://api.open-elevation.com/api/v1/lookup?locations="+this.latlng.lat+","+this.latlng.lng;
        console.log(request_str);
        fetch(request_str).then(response => {
            return response.json();
        }).then( results => {
            console.log(results["results"][0]["elevation"]);
            this.alt_m = results["results"][0]["elevation"];
            this.display_form();
            this.planner.task.display_task_list();
        });
    }

    display_form() {
        let form_str = 'Name: <input onchange="change_wp_name(this.value)" value="'+this.name + '"</input>';
        form_str += '<br/>Alt: <input onchange="change_wp_alt(this.value)" value="' + this.alt_m + '"</input>' + " m";
        form_str += '<div class="menu">';
        form_str += this.planner.menuitem("Delete this WP","delete_wp");
        form_str += '</div>';
        var popup = L.popup({ offset: [0,-25]})
            .setLatLng(this.latlng)
            .setContent(form_str)
            .openOn(this.planner.map);
    }
}

// ******************************************************************************
// ***********   Task class                **************************************
// ******************************************************************************

class Task {
    constructor(planner) {
        this.planner = planner; // Reference to B21TaskPlanner instance
        this.waypoints = [];
        this.task_el = document.getElementById("task_list");
        this.index = 0; // Index of current waypoint
        this.start_index = 0;
        this.finish_index = 0;
    }

    current_wp() {
        return this.waypoints[this.index];
    }

    add_wp(marker) {
        this.index = this.waypoints.length;
        console.log("task adding wp",this.index);
        let wp = new WP(this.planner, marker, this.index);
        this.waypoints.push(wp);
        if (wp.index > 0) {
            this.add_line(this.waypoints[wp.index-1],wp);
        }
        this.display_task_list();
        return wp;
    }

    add_line(wp1, wp2) {
        let latlngs = [ wp1.latlng, wp2.latlng ];
        wp2.task_line = L.polyline(latlngs, {color: 'red'});
        wp2.task_line.addTo(this.planner.map);
    }

    redraw() {
        for (let i=1; i<this.waypoints.length; i++) {
            this.waypoints[i].task_line.remove(this.planner.map);
            this.add_line(this.waypoints[i-1], this.waypoints[i]);
        }
    }

    display_task_list() {
        while (this.task_el.firstChild) {
            this.task_el.removeChild(this.task_el.lastChild);
        }
        for (let i=0; i<this.waypoints.length; i++) {
            this.display_task_waypoint(this.waypoints[i]);
        }
    }

    display_task_waypoint(wp) {
        let wp_div = document.createElement("div");
        wp_div.className = "task_list_wp";
        if (wp.index == this.index) {
            wp_div.style.backgroundColor = "yellow";
        }
        wp_div.innerHTML = wp.index + " " + wp.name + " " + wp.alt_m;
        this.task_el.appendChild(wp_div);
    }

    remove_current() {
        this.current_wp().task_line.remove(this.planner.map);
        this.current_wp().marker.remove(this.planner.map);
        this.waypoints.splice(this.index,1);
        // Reset index values in waypoints
        for (let i=0; i<this.waypoints.length; i++) {
            this.waypoints[i].index = i;
        }
        this.redraw();
        this.display_task_list();
        this.planner.map.closePopup();
    }
}
