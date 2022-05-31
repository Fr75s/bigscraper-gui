const { ipcRenderer } = require("electron");

const fs = require("fs");
const download = require("download");
const axios = require("axios");
const ytdl = require("ytdl-core");

var conv = {};
var rconv = {};
var abbrid = {};

let appdata = ipcRenderer.sendSync("get-appdata")[0];
let documentFolder = ipcRenderer.sendSync("get-appdata")[1];

let bulkFoundGames = 0;
let bulkCompletedGames = 0;
let bulkGamesLength = 0;

let curReg = "en-us";
let opt = {
	"en-us": ["(United States)", "(North America)", "(World)"]
}

fs.readFile(__dirname + "/res/convert_flip.json", "utf8", (err, data) => {
	if (err) return console.log(err);
	rconv = JSON.parse(data);
})

fs.readFile(__dirname + "/res/abbr_id.json", "utf8", (err, data) => {
	if (err) return console.log(err);
	abbrid = JSON.parse(data);
})



function formulate(text) {
	var ret = "";
	var inbr = false;

	for (let i = 0; i < text.length; i++) {
		var letter = text.substring(i, i + 1);
		if (["(", "[", "{"].includes(letter))
			inbr = true;
		if (!inbr)
			ret += letter;
		if ([")", "]", "}"].includes(letter))
			inbr = false;
	}

	// Formulation Process
	// 1. Normalize string to decombine characters
	// 2. Regex to remove all diacritics
	// 3. Make Uppercase and trim whitespace
	// 4. Replace spaces with underscores, and several characters.
	return ret.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replaceAll(" -","").replaceAll(" ","_").replaceAll(":","").replaceAll(".","").replaceAll("!","").replaceAll("'","").replaceAll("&","AND");
}

function sysToId(system) {
	sys = system;
	if (conv[sys])
		sys = conv[sys];
	if (rconv[sys]) {
		return abbrid[sys];
	} else {
		return "INVALID";
	}
}

function abbreviate(system) {
	sys = system;
	if (conv[sys])
		return conv[sys];
	if (rconv[sys])
		return sys;
	return "INVALID";
}

function trimExt(name) {
	// Remove all dots at the end of a string with 4 or more characters following

	let dotfollow = name.substring(name.lastIndexOf(".") + 1);
	while (dotfollow.length <= 4 && name.lastIndexOf(".") != -1) {
		name = name.substring(0, name.lastIndexOf("."));
		if (name.lastIndexOf(".") != -1) {
			dotfollow = name.substring(name.lastIndexOf(".") + 1);
		}
	}

	return name;
}



function scrapePagesInOrder(pagenum, curGame, systemID) {
	return axios.get("https://gamesdb.launchbox-app.com/platforms/games/" + systemID + "|" + pagenum).then((res) => {
		console.log("Scraping https://gamesdb.launchbox-app.com/platforms/games/211|" + pagenum)
		notifyUser("Scraping Page " + pagenum);
		let scrape = scrapePageForGame(res.data, curGame["name"]);

		console.log("Result: " + scrape);
		if (scrape == "EOF" || pagenum > 50)
			return "EOF";
		else if (scrape == "NOTFOUND")
			return scrapePagesInOrder(pagenum + 1, curGame, systemID);
		else
			return scrape;
	})
}

function scrapePageForGame(pageData, game) {
	let parser = new DOMParser();
	let html = parser.parseFromString(pageData, "text/html");

	// Parse for game names
	let rawGames = html.evaluate("//div[@class='col-sm-10']/h3/text()", html);

	let games = [];
	while (g = rawGames.iterateNext()) {
		games.push(g.textContent.trim());
	}

	console.log(games);
	if (games.length == 0) {
		return "EOF";
	}

	let fgames = [];
	for (g in games) {
		fgames.push(formulate(games[g]));
	}

	let searchTerm = trimExt(game);

	if (fgames.includes(formulate(searchTerm))) {
		let detLinksRaw = html.evaluate('//a[@class="list-item"]/@href', html);
		let gameIndex = fgames.indexOf(formulate(searchTerm))

		detLink = detLinksRaw.iterateNext().textContent.trim();
		for (let i = 0; i < gameIndex; i++) {
			detLink = detLinksRaw.iterateNext().textContent.trim();
		}

		dls = detLink.split("/");
		dbid = dls[dls.length - 1];

		return dbid;
	} else {
		return "NOTFOUND";
	}
}

function scrapePagesInOrderMulti(pagenum, gamesList, system) {
	let systemID = sysToId(system);
	return axios.get("https://gamesdb.launchbox-app.com/platforms/games/" + systemID + "|" + pagenum).then((res) => {
		console.log("Scraping https://gamesdb.launchbox-app.com/platforms/games/211|" + pagenum)

		notifyUser("Scraping Page " + pagenum);

		let scrape = scrapePageForGames(res.data, gamesList);

		if (Object.keys(scrape).length > 0) {
			if (scrape["EOF"]) {
				notifyUser("Final page reached, please wait.");
				if (bulkFoundGames < bulkGamesLength) {
					let diff = bulkGamesLength - bulkFoundGames;
					notifyUser("Couldn't find " + diff + " game(s), wait for current scraping to finish.");
					bulkGamesLength = bulkFoundGames;
				}
				return "EOF";
			} else {
				notifyUser("Found " + Object.keys(scrape).length + " games in page " + pagenum + ", scraping...");
				for (path in scrape) {
					for (let i = 0; i < gamesList.length; i++) {
						let game = gamesList[i];
						if (game["path"] == path) {
							scrapeGameDataSimul(scrape[path], game, system);
							break;
						}
					}
				}
				return scrapePagesInOrderMulti(pagenum + 1, gamesList, system);
			}
		} else {
			return scrapePagesInOrderMulti(pagenum + 1, gamesList, system);
		}
	})
}

function scrapePageForGames(pageData, games) {
	console.log("Scraping Page");
	let parser = new DOMParser();
	let html = parser.parseFromString(pageData, "text/html");

	let ret = {};

	let rawGames = html.evaluate("//div[@class='col-sm-10']/h3/text()", html);

	let titles = [];
	while (g = rawGames.iterateNext()) {
		titles.push(g.textContent.trim());
	}

	if (titles.length == 0) {
		return {"EOF": "EOF"};
	}

	let fgames = [];
	for (g in titles) {
		fgames.push(formulate(titles[g]));
	}

	for (let i = 0; i < games.length; i++) {
		let gform = formulate(trimExt(games[i]["name"]));

		if (fgames.includes(gform)) {
			let detLinksRaw = html.evaluate('//a[@class="list-item"]/@href', html);

			// Get Game Data
			let gameIndex = fgames.indexOf(gform);
			bulkFoundGames++;

			detLink = detLinksRaw.iterateNext().textContent.trim();
			for (let i = 0; i < gameIndex; i++) {
				detLink = detLinksRaw.iterateNext().textContent.trim();
			}

			dls = detLink.split("/");
			dbid = dls[dls.length - 1];

			console.log("Found game in page (" + dbid + ")")
			notifyUser("Found game in page (" + dbid + ")");
			ret[games[i]["path"]] = dbid;
		}
	}

	return ret;

}

function scrapeGameData(gameID, gameFile, system) {
	let meta = {}

	notifyUser("Getting Game Metadata...");
	axios.get("https://gamesdb.launchbox-app.com/games/details/" + gameID).then((res) => {
		console.log("Scraping Details for " + gameID);

		meta["File"] = gameFile["path"];

		var parser = new DOMParser();
		let html = parser.parseFromString(res.data, "text/html");

		let details = html.evaluate("//td[@class='row-header']/text()", html);
		while (detailNode = details.iterateNext()) {
			d = detailNode.textContent.trim()

			if (["Name", "Platform", "Release Date", "Game Type", "ESRB", "Max Players", "Cooperative"].includes(d)) {
				res = html.evaluate('//td[@class="row-header" and text()="' + d + '"]/../td[2]/span[1]/text()', html);
				l = [];
				while (r = res.iterateNext()) {
					l.push(r.textContent);
				}
				meta[d] = l;
			}

			if (["Developers", "Publishers", "Genres", "Wikipedia", "Video Link"].includes(d)) {
				res = html.evaluate('//td[@class="row-header" and text()="' + d + '"]/../td[2]/span[1]/a/text()', html);
				l = [];
				while (r = res.iterateNext()) {
					l.push(r.textContent);
				}
				meta[d] = l;
			}

			if (["Overview"].includes(d))
				meta[d] = [html.evaluate('//div[@class="view"]/text()', html).iterateNext().textContent];

			if (["Rating"].includes(d))
				meta[d] = [html.evaluate('//span[@id="communityRating"]/text()', html).iterateNext().textContent];
		}

		notifyUser("Getting Images...");
		axios.get("https://gamesdb.launchbox-app.com/games/images/" + gameID).then((res) => {
			console.log("Scraping Images for " + gameID);

			html = parser.parseFromString(res.data, "text/html");

			let linksRaw = html.evaluate('//a[contains(@href, "https://images.launchbox-app.com")]/@href', html);
			let links = [];
			while (l = linksRaw.iterateNext()) {
				links.push(l.textContent);
			}

			let titlesRaw = html.evaluate('//a[contains(@href, "https://images.launchbox-app.com")]/@data-title', html);
			let titles = [];
			while (l = titlesRaw.iterateNext()) {
				titles.push(l.textContent);
			}

			meta["Images"] = (titles.length > 0 ? titles : ["NULL"]);

			console.log(meta);


			// Save Game Metadata to JSON file
			let cloc = appdata + "/storedMeta/cache/";

			if (!fs.existsSync(cloc + system)) {
				fs.mkdir(cloc + system, {recursive : true}, (err) => {
					if (err) { return console.log(err); }
				});
			}

			fs.writeFile(cloc + system + "/" + formulate(meta["Name"][0]) + ".json", JSON.stringify(meta), (err) => {
				if (err) { return console.log(err); }
				console.log("Game Metadata Saved.");
			})

			// Save Game Images
			let completedDownloads = 0;

			if (meta["Video Link"]) {
				let vdl = ytdl(meta["Video Link"][0]);
				vdl.pipe(fs.createWriteStream(appdata + "/storedMeta/images/" + system + "/" + formulate(trimExt(gameFile["name"])) + "/" + meta["Name"][0] + " - Video.mp4"));
				vdl.on("finish", () => {
					completedDownloads += 1;
					if (completedDownloads == links.length + 1) {
						notifyUser("Process Complete.");
						setTimeout(returnHome, 3000);
					}
				})
			}
			for (let i = 0; i < links.length; i++) {
				link = links[i];

				let loc = appdata + "/storedMeta/images/" + system + "/" + formulate(trimExt(gameFile["name"])) + "/" + titles[i] + ".png";

				let locRoot = loc.substring(0, loc.lastIndexOf("/"));
				let locName = loc.substring(loc.lastIndexOf("/") + 1);

				if (!fs.existsSync(locRoot)) {
					fs.mkdir(locRoot, {recursive : true}, (err) => {
						if (err) { return console.log(err); }
					});
				}

				download(link, locRoot, {filename: locName}).then(() => {
					completedDownloads += 1;

					let totalDownloads = (meta["Video Link"]) ? links.length + 1 : links.length;
					console.log("Image Downloaded (" + completedDownloads + "/" + totalDownloads + ")");

					notifyUser("Downloaded Image " + completedDownloads + " of " + totalDownloads);

					if (completedDownloads == totalDownloads) {
						notifyUser("Process Complete.");

						setTimeout(returnHome, 3000);
					}
				})
			}

		})

	})
}

function scrapeGameDataSimul(gameID, gameFile, system) {
	console.log(gameID);
	console.log(gameFile);
	console.log(system);

	let meta = {}

	axios.get("https://gamesdb.launchbox-app.com/games/details/" + gameID).then((res) => {
		console.log("Scraping Details for " + gameID);

		meta["File"] = gameFile["path"];

		var parser = new DOMParser();
		let html = parser.parseFromString(res.data, "text/html");

		let details = html.evaluate("//td[@class='row-header']/text()", html);
		while (detailNode = details.iterateNext()) {
			d = detailNode.textContent.trim()

			if (["Name", "Platform", "Release Date", "Game Type", "ESRB", "Max Players", "Cooperative"].includes(d)) {
				res = html.evaluate('//td[@class="row-header" and text()="' + d + '"]/../td[2]/span[1]/text()', html);
				l = [];
				while (r = res.iterateNext()) {
					l.push(r.textContent);
				}
				meta[d] = l;
			}

			if (["Developers", "Publishers", "Genres", "Wikipedia", "Video Link"].includes(d)) {
				res = html.evaluate('//td[@class="row-header" and text()="' + d + '"]/../td[2]/span[1]/a/text()', html);
				l = [];
				while (r = res.iterateNext()) {
					l.push(r.textContent);
				}
				meta[d] = l;
			}

			if (["Overview"].includes(d))
				meta[d] = [html.evaluate('//div[@class="view"]/text()', html).iterateNext().textContent];

			if (["Rating"].includes(d))
				meta[d] = [html.evaluate('//span[@id="communityRating"]/text()', html).iterateNext().textContent];
		}

		axios.get("https://gamesdb.launchbox-app.com/games/images/" + gameID).then((res) => {
			console.log("Scraping Images for " + gameID);

			html = parser.parseFromString(res.data, "text/html");

			let linksRaw = html.evaluate('//a[contains(@href, "https://images.launchbox-app.com")]/@href', html);
			let links = [];
			while (l = linksRaw.iterateNext()) {
				links.push(l.textContent);
			}

			let titlesRaw = html.evaluate('//a[contains(@href, "https://images.launchbox-app.com")]/@data-title', html);
			let titles = [];
			while (l = titlesRaw.iterateNext()) {
				titles.push(l.textContent);
			}

			meta["Images"] = (titles.length > 0 ? titles : ["NULL"]);

			console.log(meta);


			// Save Game Metadata to JSON file
			let cloc = appdata + "/storedMeta/cache/";

			if (!fs.existsSync(cloc + system)) {
				fs.mkdir(cloc + system, {recursive : true}, (err) => {
					if (err) { return console.log(err); }
				});
			}

			fs.writeFile(cloc + system + "/" + formulate(meta["Name"][0]) + ".json", JSON.stringify(meta), (err) => {
				if (err) { return console.log(err); }
				console.log("Game Metadata Saved.");
			})

			// Save Game Images
			let completedDownloads = 0;

			if (meta["Video Link"]) {
				let vdl = ytdl(meta["Video Link"][0]);
				vdl.pipe(fs.createWriteStream(appdata + "/storedMeta/images/" + system + "/" + formulate(trimExt(gameFile["name"])) + "/" + meta["Name"][0] + " - Video.mp4"));
				vdl.on("finish", () => {
					completedDownloads += 1;
					if (completedDownloads == links.length + 1) {
						bulkCompletedGames++;

						if (bulkCompletedGames == bulkGamesLength) {
							notifyUser("Metadata Gathered for " + meta["Name"] + ", Process Complete.");

							bulkCompletedGames = 0;
							bulkGamesLength = 0;

							setTimeout(returnHome, 3000);
						} else {
							notifyUser("Metadata Gathered for " + meta["Name"] + " (" + bulkCompletedGames + "/" + bulkGamesLength + ")");
						}
					}
				})
			}
			for (let i = 0; i < links.length; i++) {
				link = links[i];

				let loc = appdata + "/storedMeta/images/" + system + "/" + formulate(trimExt(gameFile["name"])) + "/" + titles[i] + ".png";

				let locRoot = loc.substring(0, loc.lastIndexOf("/"));
				let locName = loc.substring(loc.lastIndexOf("/") + 1);

				if (!fs.existsSync(locRoot)) {
					fs.mkdir(locRoot, {recursive : true}, (err) => {
						if (err) { return console.log(err); }
					});
				}

				download(link, locRoot, {filename: locName}).then(() => {
					completedDownloads += 1;

					let totalDownloads = (meta["Video Link"]) ? links.length + 1 : links.length;
					console.log("Image Downloaded for " + gameFile["name"] + "(" + completedDownloads + "/" + totalDownloads + ")");

					if (completedDownloads == totalDownloads) {
						bulkCompletedGames++;

						if (bulkCompletedGames == bulkGamesLength) {
							notifyUser("Metadata Gathered for " + meta["Name"] + ", Process Complete.");

							bulkCompletedGames = 0;
							bulkGamesLength = 0;

							setTimeout(returnHome, 3000);
						} else {
							notifyUser("Metadata Gathered for " + meta["Name"] + " (" + bulkCompletedGames + "/" + bulkGamesLength + ")");
						}
					}
				})
			}

		})

	})
}



function exportData(platform, system, folder) {
	// system doesn't end with /
	let metaLoc = appdata + "/storedMeta/cache/" + system + "/";
	let mediaLoc = appdata + "/storedMeta/images/" + system + "/";

	let outLoc = folder + "/";

	if (["PEGASUS"].includes(formulate(platform))) {
		console.log("Exporting for Pegasus");

		fs.readdir(metaLoc, (err, files) => {
			if (err) { return console.log(err); }
			let outLines = "";

			outLines += "collection: " + rconv[system] + "\n";
			outLines += "shortname: " + system + "\n";
			outLines += "command: INSERT_COMMAND_HERE" + "\n";

			outLines += "\n";

			for (let cf = 1; cf <= files.length; cf++) {
				let cfile = files[cf - 1];
				fs.readFile(metaLoc + cfile, "utf8", (err, data) => {
					if (err) { return console.log(err); }

					let meta = JSON.parse(data);

					outLines += "game: " + meta["Name"][0] + "\n";
					outLines += "file: " + meta["File"] + "\n";
					if (meta["Rating"])
						outLines += "rating: " + meta["Rating"][0] + "\n";
					if (meta["Overview"])
						outLines += "description: " + meta["Overview"][0] + "\n";
					if (meta["OVerview"])
						outLines += "summary: " + meta["Overview"][0] + "\n";

					if (meta["Developers"])
						for (let i = 0; i < meta["Developers"].length; i++)
							outLines += "developers: " + meta["Developers"][i] + "\n";
					if (meta["Publishers"])
						for (let i = 0; i < meta["Publishers"].length; i++)
							outLines += "publishers: " + meta["Publishers"][i] + "\n";
					if (meta["Genres"])
						for (let i = 0; i < meta["Genres"].length; i++)
							outLines += "genres: " + meta["Genres"][i] + "\n";

					if (meta["Max Players"])
						outLines += "players: " + meta["Max Players"][0] + "\n";

					// Release
					let dateform = ["January", "1,", "1970"]
					console.log(meta["Release Date"])
					if (meta["Release Date"]) {
						if (meta["Release Date"][0].length > 4) {
							dateform = meta["Release Date"][0].split(" ");

							dmy_convert = {"January": "01","February": "02","March": "03","April": "04","May": "05","June": "06","July": "07","August": "08","September": "09","October": "10","November": "11","December": "12"};
							dateform[0] = dmy_convert[dateform[0]]

							dateform[1] = dateform[1].split(",")[0];
							if (Number(dateform[1]) < 10)
								dateform[1] = "0" + dateform[1];

							outLines += "release: " + dateform[2] + "-" + dateform[0] + "-" + dateform[1] + "\n";
							outLines += "releaseYear: " + dateform[2] + "\n";
							outLines += "releaseMonth: " + dateform[0] + "\n";
							outLines += "releaseDay: " + dateform[1] + "\n";
						} else {
							dateform = [meta["Release Date"][0]];
							outLines += "releaseYear: " + dateform[0] + "\n";
						}
					}

					// Images
					console.log(formulate(meta["Name"][0]));
					let thisMediaLoc = mediaLoc + formulate(meta["Name"][0]) + "/";

					let imgs = copyGameImgs(metaLoc + cfile, thisMediaLoc, folder, "PEGASUS");

					outLines += imgs;

					// Video
					if (meta["Video Link"]) {
						notifyUser("Getting Video for " + meta["Name"][0]);

						fs.mkdirSync(outLoc + "media/video/", {recursive: true});
						let videos = copyGameVideo(thisMediaLoc + meta["Name"][0] + " - Video.mp4", outLoc + "media/video/" + meta["Name"][0] + " - Video.mp4", "PEGASUS");

						outLines += videos;
					}

					outLines += "\n\n";

					if (cf == files.length) {
						console.log(outLines);
						fs.writeFile(outLoc + "metadata.pegasus.txt", outLines, (err) => {
							if (err) { return console.log(err); }
							notifyUser("Metadata Exported. Process Complete.");
							setTimeout(returnHome, 3000);
						})
					}
				})
			}
		})

	} else if (["EMULATIONSTATION"].includes(formulate(platform))) {
		console.log("Exporting for Stinky");

		fs.readdir(metaLoc, (err, files) => {
			if (err) { return console.log(err); }
			let outLines = "";

			outLines += "<gameList>\n";

			for (let cf = 1; cf <= files.length; cf++) {
				let cfile = files[cf - 1];
				fs.readFile(metaLoc + cfile, "utf8", (err, data) => {
					if (err) { return console.log(err); }

					let meta = JSON.parse(data);

					outLines += "\t<game>\n";
					outLines += "\t\t<path>" + meta["File"] + "</path>\n";
					outLines += "\t\t<name>" + meta["Name"][0] + "</name>\n";
					if (meta["Developers"])
						outLines += "\t\t<developer>" + meta["Developers"][0] + "</developer>\n";
					if (meta["Publishers"])
						outLines += "\t\t<publisher>" + meta["Publishers"][0] + "</publisher>\n";
					if (meta["Genres"])
						outLines += "\t\t<genre>" + meta["Genres"][0] + "</genre>\n";
					if (meta["Overview"])
						outLines += "\t\t<desc>" + meta["Overview"][0] + "</desc>\n";
					if (meta["Max Players"])
						outLines += "\t\t<players>" + meta["Max Players"][0] + "</players>\n";

					if (meta["Release Date"]) {
						if (meta["Release Date"][0].length > 4) {
							dateform = meta["Release Date"][0].split(" ");

							dmy_convert = {"January": "01","February": "02","March": "03","April": "04","May": "05","June": "06","July": "07","August": "08","September": "09","October": "10","November": "11","December": "12"};
							dateform[0] = dmy_convert[dateform[0]]

							dateform[1] = dateform[1].split(",")[0];
							if (Number(dateform[1]) < 10)
								dateform[1] = "0" + dateform[1];

							outLines += "\t\t<releasedate>" + dateform[2] + dateform[0] + dateform[1] + "T000000</releasedate>\n";
						}
					}

					if (meta["Rating"])
						outLines += "\t\t<rating>" + (Number(meta["Rating"][0]) / 5) + "</rating>\n";

					let thisMediaLoc = mediaLoc + formulate(meta["Name"][0]) + "/";
					let imgs = copyGameImgs(metaLoc + cfile, thisMediaLoc,  folder, "ES-DE");

					imgs = imgs.substring(imgs.indexOf(":") + 2);

					outLines += "\t\t<image>" + imgs + "</image>\n";
					outLines += "\t</game>\n";

					if (cf == files.length) {
						outLines += "</gameList>";
						console.log(outLines);
						fs.writeFile(outLoc + "gamelist.xml", outLines, (err) => {
							if (err) { return console.log(err); }
							notifyUser("Metadata Exported. Process Complete.");
							setTimeout(returnHome, 3000);
						})
					}


				})
			}
		})


	} else {
		notifyUser("Invalid Export Platform");
		console.log("Invalid Export Platform");
		setTimeout(returnHome, 3000);
	}
}

function copyGameImgs(metaFile, mediaLoc, destPre, type) {
	let meta = JSON.parse(fs.readFileSync(metaFile, {encoding: "utf8"}));
	let dest = destPre + "/media";
	let retImgs = {};

	let artconv = {
		"Box - Front": ["boxFront"],
		"Box - Back": ["boxBack"],
		"Clear Logo": ["logo", "wheel"],
		"Cart - Front": ["cartridge"],
		"Disc": ["cartridge"],
		"Screenshot - Gameplay": ["gameplay", "background", "titlescreen"],
		"Background": ["background"],
		"Screenshot - Game Title": ["titlescreen"],
		"Video": ["video"]
	}

	for (art in artconv) {
		fs.mkdirSync(dest + "/" + artconv[art][0], {recursive: true});

		notifyUser("Starting image copy for " + meta["Name"][0]);
		for (let i = 0; i < meta["Images"].length; i++) {
			if (meta["Images"][i].includes(art)) {

				let imageValid = false;
				for (let j = 0; j < opt[curReg].length; j++) {
					if (meta["Images"][i].includes(opt[curReg][j])) {
						imageValid = true;

						console.log(meta["Images"][i] + " is of region " + opt[curReg][j]);

						notifyUser("Copying " + meta["Images"][i] + " to media folder");
						fs.copyFileSync(mediaLoc + meta["Images"][i] + ".png", dest + "/" + artconv[art][0] + "/" + meta["Images"][i] + ".png");

						for (let k = 0; k < artconv[art].length; k++)
							if (!retImgs[artconv[art][k]])
								retImgs[artconv[art][k]] = "assets." + artconv[art][k] + ": " + destPre + "/media/" + artconv[art][0] + "/" + meta["Images"][i] + ".png\n";

					}
				}
				if (!imageValid && !meta["Images"][i].includes("(")) {
					imageValid = true;

					console.log(meta["Images"][i] + " has no specified region");

					notifyUser("Copying " + meta["Images"][i] + " to media folder");
					fs.copyFileSync(mediaLoc + meta["Images"][i] + ".png", dest + "/" + artconv[art][0] + "/" + meta["Images"][i] + ".png");

					for (let k = 0; k < artconv[art].length; k++)
						if (!retImgs[artconv[art][k]])
							retImgs[artconv[art][k]] = "assets." + artconv[art][k] + ": " + destPre + "/media/" + artconv[art][0] + "/" + meta["Images"][i] + ".png\n";
				}
			}
		}
	}

	let ret = "";
	for (key in retImgs) {
		ret += retImgs[key];
	}

	notifyUser("All Images for " + meta["Name"][0] + " copied.");

	if (type == "ES-DE") {
		return retImgs["boxFront"];
	}
	return ret;
}

function copyGameVideo(vfile, dest, type) {
	fs.copyFileSync(vfile, dest);
	if (type == "PEGASUS")
		return "assets.video: " + dest;
	return "-";
}



function notifyUser(msg) {
	document.getElementById("work").innerHTML = msg;
}

function returnHome() {
	document.getElementById("menuBar").style.display = "block";

	pages = document.querySelectorAll(".page");
	for (let i = 0; i < pages.length; i++) {
		pages[i].style.display = "none";
		if (pages[i].id == "pHome")
			pages[i].style.display = "block";
	}
}





window.addEventListener("DOMContentLoaded", () => {
	console.log("Window Loaded");

	function setDarkMode(dark) {
		console.log("SET TO " + dark);
		const rt = document.querySelector(":root");

		let icos = document.getElementsByClassName("icon");
		let hicos = document.getElementsByClassName("homeico");

		if (dark) {
			rt.style.setProperty("--background-main", "#16171A");
			rt.style.setProperty("--background-sub", "#212326");
			rt.style.setProperty("--header", "#1E2126");
			rt.style.setProperty("--text", "#EEEEEE");
			rt.style.setProperty("--shadow-opacity", 0.4);
			for (let i = 0; i < icos.length; i++) {
				let oldSrc = trimExt(icos[i].getAttribute("src"));
				icos[i].setAttribute("src", oldSrc.split("_")[0] + ".svg");
				hicos[i].setAttribute("src", oldSrc.split("_")[0] + ".svg");
			}
		} else {
			rt.style.setProperty("--background-main", "#EEEEEE");
			rt.style.setProperty("--background-sub", "#DDDDDD");
			rt.style.setProperty("--header", "#E1E1E1");
			rt.style.setProperty("--text", "#121212");
			rt.style.setProperty("--shadow-opacity", 0.2);
			for (let i = 0; i < icos.length; i++) {
				let oldSrc = trimExt(icos[i].getAttribute("src"));
				icos[i].setAttribute("src", oldSrc + "_blk.svg");
				hicos[i].setAttribute("src", oldSrc + "_blk.svg");
			}
		}
	}

	ipcRenderer.on("native-theme-update", (event, theme) => {
		console.log("Dark Mode is " + theme);
		setDarkMode(theme);
	})

	let options = "<option>Choose System</option>";
	for (c in conv) {
		options += "<option value='" + conv[c] + "'>" + c + "</option>";
	}

	document.getElementById("platformexp").innerHTML = `
	<option>Choose Platform</option>
	<option value="pegasus">Pegasus</option>
	<option value="esde">EmulationStation (gamelist.xml)</option>
	`;

	fs.readFile(__dirname + "/res/convert.json", "utf8", (err, data) => {
		if (err) return console.log(err);
		conv = JSON.parse(data);

		let sysSelOptions = "<option>Choose System</option>";
		for (c in conv) {
			sysSelOptions += "<option value='" + conv[c] + "'>" + c + "</option>";
		};

		document.getElementById("systems").innerHTML = sysSelOptions;
		document.getElementById("systemsbulk").innerHTML = sysSelOptions;
		document.getElementById("sysexp").innerHTML = sysSelOptions;
	})

	let curGame = "";
	const fileIn = document.getElementById("titlein");
	fileIn.onchange = () => {
		curGame = fileIn.files[0];

		document.getElementById("titleinlbl").innerHTML = curGame["name"];
	}

	/*
	let curFold = [];
	const foldIn = document.getElementById("titleinb");
	foldIn.onchange = () => {
		curFold = [];
		let uFold = foldIn.files;

		for (let i = 0; i < uFold.length; i++) {
			let tp = uFold[i]["name"].substring(uFold[i]["name"].lastIndexOf(".") + 1);

			if (!["","txt","png","jpg","sav","srm","cue"].includes(tp)) {
				curFold.push(uFold[i]);
			}
		}

		console.log(curFold);

		document.getElementById("titleinlblb").innerHTML = curFold[0]["path"].substring(0, curFold[0]["path"].lastIndexOf("/"));
	}
	*/

	let system = "";
	let sysvalid = false;
	document.getElementById("systems").onchange = () => {
		s = document.getElementById("systems")

		system = conv[s.options[s.selectedIndex].text];

		if (conv[system] || rconv[system])
			sysvalid = true;
		else
			sysvalid = false;

		console.log(system);
	}

	let systemB = "";
	let sysvalidB = false;
	document.getElementById("systemsbulk").onchange = () => {
		s = document.getElementById("systemsbulk")

		systemB = conv[s.options[s.selectedIndex].text];

		if (conv[systemB] || rconv[systemB])
			sysvalidB = true;
		else
			sysvalidB = false;

		console.log(systemB);
	}

	let systemE = "";
	let sysvalidE = false;
	document.getElementById("sysexp").onchange = () => {
		s = document.getElementById("sysexp")

		systemE = conv[s.options[s.selectedIndex].text];

		if (conv[systemE] || rconv[systemE])
			sysvalidE = true;
		else
			sysvalidE = false;

		console.log(systemE);
	}

	let exPlatform = "";
	let validExport = false;
	document.getElementById("platformexp").onchange = () => {
		s = document.getElementById("platformexp")

		exPlatform = s.options[s.selectedIndex].text;

		validExport = (exPlatform != "Choose Platform");
	}

	// Action on Scrape Button Click
	document.getElementById("scrape").onclick = (() => {
		console.log("Getting Page...");
		notifyUser("Starting...");

		document.getElementById("menuBar").style.display = "none";
		pages = document.querySelectorAll(".page");
		for (let i = 0; i < pages.length; i++) {
			pages[i].style.display = "none";
		}
		document.getElementById("pWork").style.display = "block";

		// Fetch Page
		if (sysvalid && curGame != "") {
			// Scrape Pages
 			let dbid = scrapePagesInOrder(1, curGame, sysToId(system));

			// Scrape Details if ID Found
			dbid.then((value) => {
				if (value != "EOF") {
					scrapeGameData(value, curGame, abbreviate(system));
				} else {
					notifyUser("Game not found.");
					console.log("Not found :(");
					setTimeout(returnHome, 3000);
				}
			})
		} else {
			console.log("Invalid System/Game");
			notifyUser("Invalid system or game.");
			setTimeout(returnHome, 3000);
		}
	})

	let curFold = [];
	document.getElementById("titleinb").onclick = (() => {
		console.log("Bringing up folder picker");
		let choice = ipcRenderer.sendSync("show-folder-dialog");

		if (choice != "CANCEL") {
			let folder = fs.readdirSync(choice);
			for (let i = 0; i < folder.length; i++) {
				let ext = folder[i].substring(folder[i].lastIndexOf(".") + 1);

				if (!["","txt","png","jpg","sav","srm","cue"].includes(ext) && folder[i].lastIndexOf(".") != -1)
					curFold.push({"name": folder[i], "path": (choice + "/" + folder[i])});
			}
			console.log(curFold);
			document.getElementById("titleinb").innerHTML = choice;
		}
	})

	document.getElementById("scrapef").onclick = (() => {
		console.log("Getting 1st Page...");
		notifyUser("Starting...");

		document.getElementById("menuBar").style.display = "none";
		pages = document.querySelectorAll(".page");
		for (let i = 0; i < pages.length; i++) {
			pages[i].style.display = "none";
		}
		document.getElementById("pWork").style.display = "block";

		// Fetch Page
		if (sysvalidB && curFold != []) {
			bulkFoundGames = 0;
			bulkGamesLength = curFold.length;
			scrapePagesInOrderMulti(1, curFold, abbreviate(systemB));
		} else {
			console.log("Invalid System/Folder");
			notifyUser("Invalid system or game folder.");
			setTimeout(returnHome, 3000);
		}
	})

	let expFolder = "";
	document.getElementById("expin").onclick = (() => {
		console.log("Bringing up folder picker");
		let choice = ipcRenderer.sendSync("show-folder-dialog");

		console.log(choice);
		if (choice != "CANCEL") {
			expFolder = choice;
			document.getElementById("expin").innerHTML = choice;
		}
	})

	document.getElementById("export").onclick = (() => {
		notifyUser("Starting...");
		document.getElementById("menuBar").style.display = "none";
		pages = document.querySelectorAll(".page");
		for (let i = 0; i < pages.length; i++) {
			pages[i].style.display = "none";
		}
		document.getElementById("pWork").style.display = "block";

		console.log(validExport);
		console.log(systemE);
		console.log(sysvalidE);

		if (validExport && sysvalidE) {
			if (expFolder != "") {
				exportData(exPlatform, abbreviate(systemE), expFolder)
			} else {
				exportData(exPlatform, abbreviate(systemE), (documentFolder + "/bigscraper/output/" + systemE));
			}
		} else {
			console.log("Invalid Export/System");
			notifyUser("Invalid export choice or system");
			setTimeout(returnHome, 3000);
		}
	})


	document.getElementById("set-darkmode").onclick = () => {
		setDarkMode(getComputedStyle(document.querySelector(":root")).getPropertyValue("--background-main") == "#EEEEEE");
	}
})




