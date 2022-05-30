# bigscraper-gui

## Scrape game information and images from the Launchbox database

Bigscraper is a tool used to scrape metadata and images from the Launchbox games database. It does this by reading the website directly, following pages and links to get the information from the database site. Bigscraper collects data from Launchbox and allows you to put it into useful metadata files used by emulator frontends.

Currently, this tool fully supports [Pegasus Frontend](https://pegasus-frontend.org/), and that is what I will mainly support. EmulationStation support is also present, though it is still WIP.

I have already made a python script that does the same thing as this, which [can be found here.](https://github.com/Fr75s/bigscraper/) Note that I will mainly support this GUI tool, as I want to ensure an easy experience.

## Features

### Launchbox Scraping

As far as I know, this is the only tool that is able to directly scrape Launchbox for its metadata, outside of the Launchbox desktop app itself. As this app is only available on Windows, I am mainly creating this app to target non-Windows platforms, specifically Linux.

### Linux-First

Bigscraper is built for Linux first. It intends to fully support Linux. The main goal of this app is easy metadata scraping for Linux, allowing for great setups on existing frontends.

### GUI tool

Unlike other apps like [Skyscraper](https://github.com/muldjord/skyscraper), bigscraper provides a GUI, removing the requirement for terminal usage. It aims to be easy to use and setup, removing a barrier for entry for frontends.

## Installation

Currently, this project only provides an AppImage release, as it is the simplest and most convenient way I have found to package this. I have successfully built a flatpak for this application, but I still need to learn how exactly to distribute it. Potentially, I may upload this app to flathub one day for a very easy installation.

To install the app, simply navigate to the releases page, and download the AppImage. Then, simply run the application, integrating it if you wish.

## Why Electron?

You may see here that bigscraper's interface is built with electron, which has several issues with resource usage. While I would've preferred to create this project on something else, I had to balance a few points which would enable me to seamlessly make this app:

- Easy to code (I do not know C++, and it is distinct from the languages I know)
- Easy to package (preferrably into flatpak/AppImage)
- Easy to design
- Have necessary functionalities to easily port over the cli tool (parsing xml)

All these points would be fulfilled by electron, though I did consider a few other options when choosing a tool to create the GUI

- Python/Qt: While this would've been my go-to, I am unsure how exactly I would implement bigscraper's logic under pyqt. Even if I could get past that, I have tried (and failed) to build Python/Qt applications into executables in the past.
- Anything C++: As I am unfamiliar with C++, I would've spent a while learning the language before I could start. Even then, this would be an advanced project.
- Godot: Initially, Godot seemed promising, as I was familiar with it and exporting Godot apps is a breeze. The issue came about when I needed to parse the webpages, which is quite difficult, as Godot only provides a bare-bones XML parser.

This left electron as the only option that at least was fine with the 4 points I needed. While it was a little more challenging to code and I had some woes packaging this app, I did manage to code the app and create a functional AppImage and flatpak.
