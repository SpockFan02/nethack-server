
var socket;
var cx = 0;
var cy = 0;
var ctx;

var tty_queue = "";
var conn_state = 0;

var c_width = 10;
var c_height = 16;
var t_width = c_width * 80;
var t_height = c_height * 25;

var tty = [];

var timer;
var key_queue = [];

var bitmap = true;
var bitmapscale = 1;

var fontsize = 16;
var font = "monospace";
var usebold = true;
var widthadj = 0;
var heightadj = 0;

var bmcanvas;
var bmctx;
var bmfonts = [
    ["Linux Console 8x9", 8, 9, "default-9.png"],
    ["Linux Console 8x16", 8, 16, "default-16.png"],
    ["Square 16x16", 16, 16, "square-16.png"],
    ["Terminus 6x12", 6, 12, "terminus-12.png"],
    ["Terminus 8x14", 8, 14, "terminus-14.png"],
    ["Terminus 8x16", 8, 16, "terminus-16.png"],
    ["Terminus 10x18", 10, 18, "terminus-18.png"],
    ["Terminus 10x20", 10, 20, "terminus-20.png"],
    ["Terminus 11x22", 11, 22, "terminus-22.png"],
    ["Terminus 12x24", 12, 24, "terminus-24.png"],
    ["Terminus 14x28", 14, 28, "terminus-28.png"],
    ["Terminus 16x32", 16, 32, "terminus-32.png"],
    ["VGA 8x8", 8, 8, "vga-8.png"],
    ["VGA 8x10", 8, 10, "vga-10.png"],
    ["VGA 8x12", 8, 12, "vga-12.png"],
    ["VGA 8x14", 8, 14, "vga-14.png"]
];

var block_cursor = false;

var ibm2uni = [
    [0xb3, '│'],
    [0xc4, '─'],
    [0xda, '┌'],
    [0xbf, '┐'],
    [0xc0, '└'],
    [0xd9, '┘'],
    [0xc5, '┼'],
    [0xc1, '┴'],
    [0xc2, '┬'],
    [0xb4, '┤'],
    [0xc3, '├'],
    [0xfa, '·'],
    [0xfe, '▪'],
    [0xf0, '≡'],
    [0xf1, '±'],
    [0xb0, '#'],
    [0xb1, '#'],
    [0xf4, '∫'],
    [0xf7, '≅'],
];

function refresh() {
    while(key_queue.length > 0) {
	var k = key_queue.shift();
	socket.send(k);
    }
}

function handle_keypress(evt, kd) {
    var kbstate = 0;
    var which = evt.which ? evt.which : evt.keyCode;
    if(which == 8) which = 127;
    if(evt.ctrlKey && evt.which > 96) key_queue.push(String.fromCharCode(which - 96));
    if(evt.ctrlKey && evt.which > 64) key_queue.push(String.fromCharCode(which - 64));
    else if(which == 37 && kd) key_queue.push("OD");
    else if(which == 38 && kd) key_queue.push("OA");
    else if(which == 39 && kd) key_queue.push("OC");
    else if(which == 40 && kd) key_queue.push("OB");
    else key_queue.push(String.fromCharCode(which));
    evt.preventDefault();
    return false;
}

function main() {
    conn_state = 1;
    document.getElementById("connect-button").innerHTML="Disconnect";
    socket.onmessage = function(evt) {
	var reader = new FileReader();
	reader.onloadend = function() {
	    if(reader.error) console.log(reader.error);
	    var dbuf = new Uint8Array(reader.result);
	    for(var i = 0; i < dbuf.length - 1; i++)
		if(dbuf[i] > 0x7f && !bitmap) {
		    var unistr = "?";
		    for(var j = 0; j < ibm2uni.length; j++) {
			if(dbuf[i] == ibm2uni[j][0]) unistr = ibm2uni[j][1];
		    }
		    vt100_parse(unistr);
		} else {
		    vt100_parse(String.fromCharCode(dbuf[i]));
		}
	};
	reader.readAsArrayBuffer(evt.data);
//	log("'" + evt.data + "'");
    };
    socket.onclose = function(evt) {
	document.getElementById("connect-button").innerHTML="Connect";
	conn_state = 0;
	setColor(0, false);
	ctx.fillRect(0, 0, t_width, t_height);
	clearInterval(timer);
    }
    timer = setInterval(refresh, 10);
}

function connect(evt) {
    if(conn_state) {
	socket.close();
    } else {
	socket = new WebSocket("ws://fuck-my.life/websocket/");
	socket.onopen = main;
    }
    this.blur();
}

function step_term() {
    vt100_parse(tty_queue[0]);
    tty_queue = tty_queue.substr(1);
}

var vt100_state = "ground";
var vt100_param;
var vt100_ic;

function log(s) {
//    document.getElementById("log").innerHTML += s + "<br>";
    console.log(s);
}    

var colors = [
    "#000000", "#AA0000", "#00AA00", "#AA5500", "#3333AA", "#AA00AA", "#00AAAA", "#AAAAAA", "#000000", "#000000", "#000000"
];

var colors_bold = [
    "#555555", "#ff5555", "#55ff55", "#ffff55", "#5555ff", "#ff55ff", "#55ffff", "#ffffff", "#000000", "#000000", "#000000"
];

var fg = 7, bg = 0;
var rev = 0;
var bold = 0;

function move_curs(x, y) {
    var ox = cx;
    var oy = cy;
    cx = x;
    cy = y;
    if(cx > 79) cx = 79;
    if(cy > 24) cy = 24;
    if(cx < 0) cx = 0;
    if(cy < 0) cy = 0;
    update_term(ox, oy);
    update_term(cx, cy);
//    log("cursor -> " + x + ", " + y + "<br>");
//    console.trace();
}

function setColor(n, is_bold) {
    if(is_bold)
	ctx.fillStyle = colors_bold[n];
    else
	ctx.fillStyle = colors[n];
}

function vt100_csi_dispatch(c) {
    var vt100_params = vt100_param.split(";");
//    log("ESC [ " + vt100_param + " " + c + "(" + cx + ", " + cy + ")");
    if(c == "A") {
	if(vt100_params != 0) {
	    move_curs(cx, cy - parseInt(vt100_params[0]));
	} else {
	    move_curs(cx, cy - 1);
	}
    } else if(c == "B") {
	if(vt100_params != 0) {
	    move_curs(cx, cy + parseInt(vt100_params[0]));
	} else {
	    move_curs(cx, cy + 1);
	}
    } else if(c == "C") {
	if(vt100_params != 0) {
	    move_curs(cx + parseInt(vt100_params[0]), cy);
	} else {
	    move_curs(cx + 1, cy);
	}
    } else if(c == "D") {
	move_curs(vt100_params[0] - 1, cy);
    } else if(c == "H") {
	if(vt100_params.length > 1) {
	    move_curs(vt100_params[1] - 1, vt100_params[0] - 1);
	} else {
	    move_curs(0, 0);
	}
    } else if(c == "J") {
	if(vt100_params[0] == 0) {
	    setColor(bg, false);
	    ctx.fillRect(0, 0, t_width, t_height);
	    setColor(fg, false);
	    tty.fill([" ", 0, 7], 0, 80 * 25);
	} else if(vt100_params[0] == 1) {
	} else if(vt100_params[0] == 2) {
	    setColor(bg, false);
	    ctx.fillRect(0, 0, t_width, t_height);
	    setColor(fg, false);
	    tty.fill([" ", 0, 7], 0, 80 * 25);
	}
    } else if(c == "K") {
	setColor(bg, false);
	ctx.fillRect(cx * c_width, cy * c_height, t_width, c_height);
	setColor(fg, true);
	tty.fill([" ", 0, 7], cy * 80 + cx, (cy + 1) * 80);
    } else if(c == "Z") {
	move_curs(Math.floor(cx / 8) * 8, cy);
	setColor(bg, false);
	ctx.fillRect(cx * c_width, cy * c_height, t_width, c_height);
	setColor(fg, true);
	tty.fill([" ", 0, 7], cy * 80 + cx, (cy + 1) * 80);
    } else if(c == "d") {
	move_curs(cx, vt100_params[0] - 1);
    } else if(c == "h") {
	log("Set mode " + vt100_params[0]);
    } else if(c == "l") {
	log("Reset mode " + vt100_params[0]);
    } else if(c == "m") {
	if(vt100_params.length > 0) {
	    for(var i = 0; i < vt100_params.length; i++) {
		if(vt100_params[i] >= 30 && vt100_params[i] <= 39) {
		    fg = vt100_params[i] - 30;
		} else if(vt100_params[i] >= 40 && vt100_params[i] <= 49) {
		    bg = vt100_params[i] - 40;
		} else if(vt100_params[i] == "" || vt100_params[i] == 0) {
		    fg = 7;
		    bg = 0;
		    bold = false;
		    rev = 0;
		} else if(vt100_params[i] == 1) {
		    bold = true;
		} else if(vt100_params[i] == 7) {
		    rev = 1;
		} else {
		    log("Unknown style " + vt100_params[i]);
		}
	    }
	} else {
	    fg = 7;
	    bg = 0;
	    rev = 0;
	    bold = false;
	}
    } else {
	log("Unknown CSI " + c + " (" + vt100_ic + " # " + vt100_param + ")");
    }
    
}

function vt100_parse(c) {
    if(vt100_state == "ground"){
	if(c == "\n") {
	    move_curs(0, cy + 1);
	} else if(c == "\r") {
	    move_curs(0, cy);
	} else if(c == "\x1b") {
	    vt100_state = "escape";
	} else if(c == "\b") {
	    move_curs(cx - 1, cy);
	} else if(c == "\t") {
	    move_curs(Math.ceil(cx / 8.0) * 8 + 8, cy);
	} else if(c.charCodeAt(0) >= 0x20) {
	    addch(cx, cy, c);
	    var ox = cx;
	    var oy = cy;
	    cx++;
	    if(cx > 80) {
		cx = 0;
		cy++;
		if(cy > 24) cy = 0;
	    }
	    update_term(ox, oy);
	    update_term(cx, cy);
	}
    } else if(vt100_state == "escape") {
	vt100_param = vt100_ic = "";
	if(c == "[") {
	    vt100_state = "csi_entry";
	} else if(c.match(/[%(]/)) {
	    vt100_state = "esc_intermediate";
	} else {
	    vt100_state = "ground";
	}
    } else if(vt100_state == "esc_intermediate") {
	vt100_state = "ground";
    } else if(vt100_state == "csi_entry") {
	if(c.match(/[0-9;]/)) {
	    vt100_param += c;
	    vt100_state = "csi_param";
	} else if(c.match(/[ -/]/)) {
	    vt100_ic += c;
	    vt100_state = "csi_intermediate";
	} else if(c.match(/[<=>?]/)) {
	    vt100_ic += c;
	    vt100_state = "csi_param";
	} else if(c == ":") {
	    vt100_state = "csi_ignore";
	} else if(c.match(/[@-~]/)) {
	    vt100_csi_dispatch(c);
	    vt100_state = "ground";
	} else {
	    vt100_state = "ground";
	}
    } else if(vt100_state == "csi_intermediate") {
	if(c.match(/[ -/]/)) {
	    vt100_ic += c;
	} else if(c.match(/[@-~]/)) {
	    vt100_csi_dispatch(c);
	    vt100_state = "ground";
	} else {
	    vt100_state = "ground";
	}
    } else if(vt100_state == "csi_param") {
	if(c.match(/[0-9;]/)) {
	    vt100_param += c;
	} else if(c.match(/[:<-?]/)) {
	    vt100_state = "csi_ignore";
	} else if(c.match(/[@-~]/)) {
	    vt100_csi_dispatch(c);
	    vt100_state = "ground";
	} else {
	    vt100_state = "ground";
	}
    } else if(vt100_state == "csi_ignore") {
	if(c.match(/[@-~]/)) {
	    vt100_state = "ground";
	}
    } else {
	vt100_state = "ground";
    }
update_status();
}

function setfontsize() {
//    bitmap = document.getElementById("usebitmap").checked;
    if(bitmap) {
	var bidx = document.getElementById("bitfont").selectedIndex;
	var img;
	if(document.getElementById("bitmapImg") == null) {
	    img = document.createElement("img");
	    img.setAttribute("id", "bitmapImg");
	} else {
	   img = document.getElementById("bitmapImg");
	}
	img.src = bmfonts[bidx][3];
	img.style.display = "none";
	img.onload = redraw_whole_tty;
	document.getElementById('image-anchor').appendChild(img);	
	c_width = bmfonts[bidx][1] * bitmapscale;
	c_height = bmfonts[bidx][2] * bitmapscale;
	bmcanvas.width = c_width;
	bmcanvas.height = c_height;
    } else {
	fontsize = document.getElementById("fontsize").value;
	usebold = document.getElementById("usebold").checked;
	font = document.getElementById("font").value;
	widthadj = document.getElementById("cwidth").value;
	heightadj = document.getElementById("cheight").value;
	block_cursor = false;
	ctx.font = "bold " + fontsize + "px " + font;
	c_height = parseInt(fontsize);
	c_height += parseInt(widthadj);
	c_height = Math.round(c_height);
	c_width = Math.max(ctx.measureText("m").width, ctx.measureText("@").width);
	c_width += parseInt(widthadj);
	c_width = Math.round(c_width);
    }
    t_height = c_height * 25;
    t_width = c_width * 80;
    document.getElementById("term").width = t_width;
    document.getElementById("term").height = t_height;
    redraw_whole_tty();
    localStorage.nhFontSize = fontsize;
    localStorage.nhUseBold = usebold;
    localStorage.nhFont = font;
    localStorage.nhWidthAdj = widthadj;
    localStorage.nhHeightAdj = heightadj;
    localStorage.nhBitmapIdx = document.getElementById("bitfont").selectedIndex;
    localStorage.nhUseBitmap = bitmap;
}

function redraw_whole_tty() {
    for(var x = 0; x < 80; x++) {
	for(var y = 0; y < 25; y++) {
	    update_term(x, y);
	}
    }
}

function drawBitmapCharacter(x, y, cd) {
    setColor(cd[1], false);
    bmctx.fillStyle = ctx.fillStyle;
    bmctx.globalCompositeOperation="source-over";
    bmctx.fillRect(0, 0, c_width / bitmapscale, c_height / bitmapscale);
    var ti = cd[0].charCodeAt(0);
    var tx = (ti % 32) * c_width;
    var ty = Math.floor(ti / 32) * c_height;
    bmctx.globalCompositeOperation="source-in";
    bmctx.drawImage(document.getElementById("bitmapImg"), tx / bitmapscale, ty / bitmapscale, c_width / bitmapscale, c_height / bitmapscale, 0, 0, c_width / bitmapscale, c_height / bitmapscale);
    setColor(cd[2], cd[3]);
    bmctx.fillStyle = ctx.fillStyle;
    bmctx.fillRect(0, 0, c_width, c_height);
    bmctx.globalCompositeOperation="destination-over";
    setColor(cd[1], false);
    bmctx.fillStyle = ctx.fillStyle;
    bmctx.fillRect(0, 0, c_width, c_height);
    ctx.globalCompositeOperation="source-over";
    ctx.drawImage(bmcanvas, 0, 0, c_width / bitmapscale, c_height / bitmapscale, x * c_width, y * c_height, c_width, c_height);
    setColor(cd[2], cd[3]);
    if(x === cx && y === cy)
	ctx.fillRect(x * c_width, (y + 1) * c_height - 1, c_width, 1);
    // for(var i = 0; i < bfont.length; i++) {
    // 	if(cd[0] == bfont[i][0]) {
    // 	    for(var ty = 0; ty < 8; ty++) {
    // 		for(var tx = 0; tx < 8; tx++) {
    // 		    if(bfont[i][ty + 1] & (1 << tx)) setColor(cd[2], cd[3]);
    // 		    else setColor(cd[1], false);
    // 		    ctx.fillRect(x * 8 + tx, y * 8 + ty, 1, 1);
    // 		}
    // 	    }
    // 	    break;
    // 	}
    // }
}

function update_term(x, y) {
    if(x < 0 || x > 79 || y < 0 || y > 79) return;
    var cd = tty[x + y * 80];
    if(bitmap) {
	drawBitmapCharacter(x, y, cd);
    } else {
	if(block_cursor && x == cx && y == cy) setColor(cd[2], cd[3]);
	else setColor(cd[1], false);
	ctx.fillRect(x * c_width, y * c_height, c_width, c_height);
	if(block_cursor && x == cx && y == cy) setColor(cd[1], false);
	else setColor(cd[2], cd[3]);
	if(cd[3] && usebold) ctx.font = "bold " + fontsize + "px " + font;
	else ctx.font = fontsize + "px " + font;
	ctx.textBaseline = "bottom";
	ctx.textAlign = "center";
	ctx.globalCompositeOperation="source-atop";
	ctx.fillText(cd[0], Math.round((x + 0.5) * c_width), Math.round((y + 1) * c_height));
	ctx.globalCompositeOperation="source-over";
	if(!block_cursor && x === cx && y === cy)
	    ctx.strokeRect(x * c_width + 1, (y + .9) * c_height, c_width - 2, 1);
    }
}    

function strline(y) {
    var str = ""
    for(x = 0; x < 80; x++) {
	if(tty[x + y * 80][0] == undefined) {
	    str = str + " ";
	} else {
	    str = str + tty[x + y* 80][0];
	}
    }
    if(str == undefined) {
	return "";
    } else {
	return str;
    }
}

var xp_levels = [
    0, 0, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10000, 20000, 40000, 80000, 160000, 320000, 640000, 1280000, 2560000, 5120000, 10000000, 20000000, 30000000, 40000000, 50000000, 60000000, 70000000, 80000000, 90000000, 100000000
];

function update_status() {
    var botl = strline(22).split(/\s+/);
    var botl2 = strline(23).split(/\s+/);
    if(strline(23).substr(0, 4) != "Dlvl" || cy == 23) return;
    try {
	var score = botl[10];
	var hp = botl2[2].split(":")[1].split("(");
	hp[1] = hp[1].substr(0, hp[1].length - 1);
	var pw = botl2[3].split(":")[1].split("(");
	pw[1] = pw[1].substr(0, pw[1].length - 1);
	var xp = botl2[5].split(":")[1].split("/");
	var hpstr = "Health: " + hp[0] + " / " + hp[1];
	var hppct = Math.round(hp[0] * 100 / hp[1]);
	var hpbar = "<div id='hpbar'><div id='hpbar_inner' style='width:" + hppct + "%'></div></div>";
	var xppct = 100 - Math.round((xp_levels[parseInt(xp[0])+1] - parseInt(xp[1])) * 100 / xp_levels[parseInt(xp[0])+1]);
	var xpstr = "Experience level " + xp[0] + " (" + xp[1] + ", " + (xp_levels[parseInt(xp[0])+1] - parseInt(xp[1])) + " remaining / " + xppct + "%)";
	var xpbar = "<div id=\"xpbar\"><div id=\"xpbar_inner\" style=\"width:" + xppct + "%\"></div></div>";
	document.getElementById("status").innerHTML = hpstr + "<br>" + hpbar + "<br>" + xpstr + "<br>" + xpbar;
    } catch(e) {
	console.log(e);
    }
}

function addch(x, y, c) {
    if(rev)
	tty[x + y * 80] = [c, fg, bg, bold];
    else
	tty[x + y * 80] = [c, bg, fg, bold];
    update_term(x, y);
//    console.log( "'" + c + "'" + " -> " + x + ", " + y);
}

function keypress(evt) {
    if(evt.which != 8 && evt.which != 27 && (evt.keyCode > 40 || evt.keyCode < 37))
	handle_keypress(evt, false);
    evt.stopPropagation(); evt.preventDefault()
}

function keydown(evt) {
    if(evt.which == 8 || evt.which == 27 || (evt.keyCode <= 40 && evt.keyCode >= 37))
	handle_keypress(evt, true);
    if(evt.ctrlKey) {
	handle_keypress(evt, true);
	evt.preventDefault();
    }
}
function tty_init() {
    document.addEventListener('keypress', keypress, true);
    document.addEventListener('keydown', keydown, true);
    var c = document.getElementById("term");
    ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    setColor(bg);
    ctx.fillRect(0, 0, t_width, t_height);
    setColor(fg);
    for(var i = 0; i < 80 * 25; i++) {
	tty[i] = [" ", 0, 7, false];
    }
/*    if(localStorage.nhFontSize != undefined) {
	fontsize = localStorage.nhFontSize;
	document.getElementById("fontsize").value = fontsize;
    }
    if(localStorage.nhUseBold != undefined) {
	usebold = localStorage.nhUseBold;
	document.getElementById("usebold").checked = usebold == "true";
    }
    if(localStorage.nhFont != undefined) {
	font = localStorage.nhFont;
	document.getElementById("font").value = font;
    }
    if(localStorage.nhWidthAdj != undefined) {
	widthadj = localStorage.nhWidthAdj;
	document.getElementById("cwidth").value = widthadj;
    }
    if(localStorage.nhHeightAdj != undefined) {
	heightadj = localStorage.nhHeightAdj;
	document.getElementById("cheight").value = heightadj;
    } */
    for(var i = 0; i < bmfonts.length; i++) {
	var o = document.createElement("option");
	o.text = bmfonts[i][0];
	document.getElementById("bitfont").options.add(o);
    }
//    if(localStorage.nhUseBitmap != undefined) {
//	bitmap = localStorage.nhUseBitmap;
//	document.getElementById("usebitmap").checked = bitmap;
  //  }
    if(localStorage.nhBitmapIdx != undefined) {
	document.getElementById("bitfont").selectedIndex = localStorage.nhBitmapIdx;
    }
    bmcanvas = document.createElement("canvas");
    bmctx = bmcanvas.getContext("2d");
    setfontsize();
}

var in_fc = false;

function show_fontconfig() {
    if(in_fc) {
	document.addEventListener('keypress', keypress, true);
	document.addEventListener('keydown', keydown, true);
	document.getElementById("term").style.display = "block";
	document.getElementById("fontconfig").style.display = "none";
	document.getElementById("fonts-button").innerHTML = "Font Configuration";
	
    } else {
	document.removeEventListener('keypress', keypress, true);
	document.removeEventListener('keydown', keydown, true);
	document.getElementById("term").style.display = "none";
	document.getElementById("fontconfig").style.display = "block";
	document.getElementById("fonts-button").innerHTML = "Back";
    }
    in_fc = !in_fc;
}
