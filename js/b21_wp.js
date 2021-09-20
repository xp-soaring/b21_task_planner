// ******************************************************************************
// ***********   WP class (waypoint)       **************************************
// ******************************************************************************

class B21_WP {

    // Waypoint may be created by a click on the map:
    //          new WP(planner, index, position)
    // or as a result of loading an MSFS flightplan:
    //          new WP(planner,index,null,WP_dom_object)
    //
    constructor(planner, index=null, position=null, dom_wp=null) {
        this.planner = planner; // reference to B21TaskPlanner instance

        this.RADIUS_DEFAULT_M = 500;

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
        this.data_icao = null; // original ICAO code from source data (may not use in output PLN if not first/last waypoint)
        this.runway = null; // Selected runway
        this.runways = null; // List of available runways
        this.alt_m = 0;
        this.alt_m_updated = false; // true is elevation has been updated
        this.radius_m = null;
        this.max_alt_m = null;
        this.min_alt_m = null;
        // turnpoint sector (Leaflet circle)
        this.sector = null;

        // Values from task
        // Note each 'leg_' value is TO this waypoint
        this.index = index;
        this.task_line = null;
        this.leg_bearing_deg = null;   // Bearing from previous WP to this WP
        this.leg_distance_m = null;    // Distance (meters) from previous WP to this WP
        this.marker = this.create_marker();
    }

    construct_from_dom(index, dom_wp) {
        let name = dom_wp.getAttribute("id");
        console.log("New WP from dom:",name);
        if (this.planner.settings.soaring_task==1 &&
            (name=="TIMECRUIS" || name=="TIMECLIMB" || name=="TIMEVERT") ){
                // Skip this waypoint, & tell the caller (Task) via an exception
                throw "SKIP_WAYPOINT";
        }
        console.log("New WP from dom OK:",name);
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

        console.log(world_position);
        this.construct_new(index,new L.latLng(lat,lng));

        this.name = name;
        this.alt_m = parseFloat(world_pos_elements[2]) / this.planner.M_TO_FEET;
        if (icao_codes.length>0) {
            this.data_icao = icao_codes[0].childNodes[0].nodeValue;
            this.icao = this.data_icao;
            console.log("Set icao to "+this.icao);
        }
        if (runways.length>0) {
            let runway_nodes = runways[0].childNodes;
            if (runway_nodes.length>0) {
                this.runway = runways[0].childNodes[0].nodeValue;
            }
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
        let icon_str = ((1+this.index)+"."+this.get_name()).replaceAll(" ","&nbsp;");
        let class_name = (this.planner.task.index == this.index) ? "wp_icon_html_current" : "wp_icon_html";
        let icon_html = '<div class="'+class_name+'">'+icon_str+"</div>";
        let wp_icon = L.divIcon( {
            className: "wp_icon",
            iconSize: [5,5],
            iconAnchor: [0,0],
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
            this.alt_m_updated = true;
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
        console.log("wp.set_icao",icao);
        if (icao=="") {
            console.log("setting icao to null");
            this.icao = null;
        } else {
            console.log("setting icao to '"+icao+"'");
            this.icao = icao;
            if (this.name==null) {
                this.name = this.icao;
                document.getElementById("wp_name").value = this.icao;
            }
        }
        this.update_icon();
    }

    get_runway() {
        return this.runway==null ? "" : this.runway;
    }

    set_runway(runway) {
        this.runway = runway;
    }

    set_radius(radius_m) {
        this.radius_m = radius_m;
    }

    get_leg_bearing() {
        if (this.leg_bearing_deg==null) {
            return "";
        }
        return this.leg_bearing_deg.toFixed(0);
    }

    update(prev_wp=null) {
        //console.log("update",this.index);
        if (prev_wp != null) {
            this.update_leg_distance(prev_wp);
            this.update_leg_bearing(prev_wp);
        }
    }

    // Add .leg_distance_m property for distance (meters) from wp to this waypoint
    // Called when task is loaded
    update_leg_distance(prev_wp) {
        this.leg_distance_m = Geo.get_distance_m(this.position, prev_wp.position);
        //console.log("update_leg_distance", this.index, this.leg_distance_m);
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

    //DEBUG highlight required ICAO entry for 1st and last WP
    display_menu() {
        let form_str = 'Name: <input id="wp_name" onchange="b21_task_planner.change_wp_name(this.value)" value="'+this.get_name() + '"</input>';

        form_str += '<br/>ICAO: <input class="wp_icao" onchange="b21_task_planner.change_wp_icao(this.value)" value="' + this.get_icao() + '"</input> ';

        form_str += ' Runway: <input id="wp_runway" class="wp_runway" onchange="b21_task_planner.change_wp_runway(this.value)" value="' + this.get_runway() + '"</input> ';
        if (this.runways != null) {
            form_str += '<select class="wp_runway_select" onchange="b21_task_planner.select_wp_runway(this.value)" value="">';
            form_str += '<option></option>';
            for (let i=0;i<this.runways.length;i++) {
                form_str += '<option>'+this.runways[i]+'</option>';
            }
            form_str += '</select>';
        }
        let alt_str = this.alt_m.toFixed(0);
        let alt_units_str = "m.";
        if (this.planner.settings.altitude_units == "feet") {
            alt_str = (this.alt_m * this.planner.M_TO_FEET).toFixed(0);
            alt_units_str = "feet.";
        }

        form_str += '<br/>Elevation: <input class="wp_alt" onchange="b21_task_planner.change_wp_alt(this.value)" value="' + alt_str + '"</input> ' + alt_units_str;

        if (this.planner.settings.soaring_task==1) {
            let start = this.index == this.planner.task.start_index;
            form_str += '<br/>Start: <input onclick="b21_task_planner.click_start(this)" type="checkbox"'+(start ? " checked":"")+'/>';
            let finish = this.index == this.planner.task.finish_index;
            form_str += ' Finish: <input  onclick="b21_task_planner.click_finish(this)" type="checkbox"'+(finish ? " checked":"")+'/> ';
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
        form_str += this.planner.menuitem("Add duplicate of this WP to task","duplicate_wp_to_task");
        form_str += this.planner.menuitem("Update this waypoint elevation","update_wp_elevation");
        form_str += '</div>';
        var popup = L.popup({ offset: [0,10]})
            .setLatLng(this.position)
            .setContent(form_str)
            .openOn(this.planner.map);
    }

    copy(index) {
        let wp = new B21_WP(this.planner, index, this.position);
        wp.name = this.name;
        wp.alt_m = this.alt_m;
        wp.icao = this.icao;
        wp.runways = this.runways;
        return wp;
    }

    // ********************************************
    // Tracklog calculations
    // Points are { lat, lng, alt_m }
    // ********************************************


    // is_start(p1, p2, leg_bearing) returns true if p1->p2 crosses the start line
    is_start(p1,p2,leg_bearing_deg) {
        //console.log("WP.is_start()");

        // Check p1 is in start sector
        if (this.max_alt_m != null && p1.alt_m > this.max_alt_m) {
            //console.log("WP.is_start() false p1 max_alt_m="+this.max_alt_m+" vs "+p1.alt_m);
            return false;
        }
        if (this.min_alt_m != null && p1.alt_m < this.min_alt_m) {
            //console.log("WP.is_start() false p1 min_alt_m="+this.min_alt_m+" vs "+p1.alt_m);
            return false;
        }

        let radius_m = this.radius_m==null ? this.RADIUS_DEFAULT_M : this.radius_m;
        let distance_m = Geo.get_distance_m(p1, this.position);
        if (distance_m > radius_m) {
            //console.log("WP.is_start() false radius_m="+radius_m.toFixed(0)+" vs "+distance_m.toFixed(0));
            return false;
        }
        let wp_bearing_deg = Geo.get_bearing_deg(p1, this.position);
        let in_sector = Geo.in_sector(leg_bearing_deg, wp_bearing_deg, 180); // Check p1 within start sector angles
        if (!in_sector) {
            //console.log("WP.is_start() false p1 at "+wp_bearing_deg.toFixed(0)+" deg not in start sector");
            return false;
        }
        // OK so p1 is in the start sector, now we need to see if p1->p2 crosses the start line
        // We do this by seeing if p2 is in the 180-degree sector OPPOSITE the start sector
        let reverse_bearing_deg = (leg_bearing_deg + 180) % 360;
        wp_bearing_deg = Geo.get_bearing_deg(p2, this.position);
        let over_start_line = Geo.in_sector(reverse_bearing_deg, wp_bearing_deg, 180);
        if (over_start_line) {
            console.log("WP.is_start true at "+wp_bearing_deg.toFixed(0));
        } else {
            //console.log("WP.is_start false at "+wp_bearing_deg.toFixed(0));
        }
        return over_start_line;
    }

    is_finish(p1,p2) {
        //console.log("wp is_finish");

        // check p1 is before finish sector
        let wp_bearing_deg = Geo.get_bearing_deg(p1, this.position);
        let before_finish_line = Geo.in_sector(this.leg_bearing_deg, wp_bearing_deg, 180);
        if (before_finish_line) {
            //console.log("WP.is_finish p1 before_finish_line=true at "+wp_bearing_deg.toFixed(0));
        } else {
            //console.log("WP.is_finish p1 before_finish_line=false at "+wp_bearing_deg.toFixed(0));
            return false;
        }
        // p1 is before finish

        // Check p2 is in finish sector
        if (this.max_alt_m != null && p2.alt_m > this.max_alt_m) {
            //console.log("WP.is_finish() false p2 max_alt_m="+this.max_alt_m+" vs "+p2.alt_m);
            return false;
        }
        if (this.min_alt_m != null && p2.alt_m < this.min_alt_m) {
            //console.log("WP.is_finish() false p2 min_alt_m="+this.min_alt_m+" vs "+p2.alt_m);
            return false;
        }

        let radius_m = this.radius_m==null ? this.RADIUS_DEFAULT_M : this.radius_m;
        let distance_m = Geo.get_distance_m(p2, this.position);
        if (distance_m > radius_m) {
            //console.log("WP.is_finish() false p2 radius_m="+radius_m.toFixed(0)+" vs "+distance_m.toFixed(0));
            return false;
        }

        let reverse_bearing_deg = (this.leg_bearing_deg + 180) % 360;
        wp_bearing_deg = Geo.get_bearing_deg(p2, this.position);
        let p2_in_sector = Geo.in_sector(reverse_bearing_deg, wp_bearing_deg, 180); // Check p2 within finish sector angles
        if (!p2_in_sector) {
            //console.log("WP.is_finish() false p2 at "+wp_bearing_deg.toFixed(0)+" deg not in finish sector");
            return false;
        }

        console.log("WP.is_finish() true");

        return true;
    }

    is_wp(p1,p2) {
        if (!this.in_wp_sector(p1) && this.in_wp_sector(p2)) {
            console.log("wp is_wp() true");
            return true;
        }
        //console.log("wp is_wp() false");
        return false;
    }

    in_wp_sector(p) {
        //console.log("in_wp_sector");
        if (this.max_alt_m != null && p.alt_m > this.max_alt_m) {
            //console.log("in_wp_sector false max_alt_m="+this.max_alt_m+" vs "+p.alt_m);
            return false;
        }
        if (this.min_alt_m != null && p.alt_m < this.min_alt_m) {
            //console.log("in_wp_sector false min_alt_m="+this.min_alt_m+" vs "+p.alt_m);
            return false;
        }
        let radius_m = this.radius_m==null ? this.RADIUS_DEFAULT_M : this.radius_m;
        let distance_m = Geo.get_distance_m(p, this.position);
        let in_sector = distance_m < radius_m;
        //console.log("in_wp_sector "+in_sector+" radius_m="+radius_m+" vs "+distance_m.toFixed(1));
        return in_sector;
    }

    // ********************************************
    // class toString
    // ********************************************

    toString() {
        return this.name;
    }
} // end WP class
