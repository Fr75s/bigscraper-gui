const daynight = document.getElementById("daynight");
const rt = document.querySelector(":root");

function setDarkMode() {
	rt.style.setProperty("--background-main", "#16171a");
	rt.style.setProperty("--background-sub", "#191c22");
	rt.style.setProperty("--text", "#eeeeee");
}

function setLightMode() {
	rt.style.setProperty("--background-main", "#f2f6ff");
	rt.style.setProperty("--background-sub", "#deeaff");
	rt.style.setProperty("--text", "#121212");
}

if (daynight.checked) {
	setDarkMode();
}

setTimeout(() => {
	rt.style.setProperty("transition", "0.4s");
	document.getElementById("header").style.setProperty("transition", "0.4s");
}, 250);

daynight.addEventListener("change", () => {
	if (daynight.checked) {
		// Dark Mode
		console.log("Dark Mode");
		setDarkMode();

	} else {
		// Light Mode
		console.log("Light Mode");

		setLightMode();

	}
})
