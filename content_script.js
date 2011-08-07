function findLinks() {
	//console.log("ChromeStation.findLinks()");
	var result = document.all.tags("A");

	var items = [];
	var count = result.length;
	for(var i=0;i<(count-1);i++) {
		var src = result[i];
		var item = { href: src.href, text: src.innerText };
		items.push(item);
	}

	//console.log(count + " links found");

	if (count > 0) {
		chrome.extension.sendRequest(items);
	}
}

findLinks();