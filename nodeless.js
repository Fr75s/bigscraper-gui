function show(page) {
	pages = document.querySelectorAll(".page");

	for (let i = 0; i < pages.length; i++) {
		if (pages[i].id == page) {
			pages[i].style.display = "block";
		} else {
			pages[i].style.display = "none";
		}
	}
}
