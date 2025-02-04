const puppeteer = require('puppeteer-extra');
const { keyboard, Key } = require('@nut-tree-fork/nut-js');
const chokidar = require('chokidar');

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const path = require('path');
const fs = require('fs');
const { get } = require('https');

// const { connect } = require('puppeteer-real-browser');
// const { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } = require('puppeteer')
// const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')
// const StealthPlugin = require('puppeteer-extra-plugin-stealth')
// const recaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
// puppeteer.use(
//     // AdblockerPlugin({
//     //     // Optionally enable Cooperative Mode for several request interceptors
//     //     interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY
//     // }),
//     // StealthPlugin(),
//     // recaptchaPlugin({
//     //     provider: {
//     //         id: '2captcha',
//     //     }
//     // })
// );


const downloadPath = 'H:/Light Novels/';

const pathToExtension = ("C:/Users/PC08718263/AppData/Local/Google/Chrome/User Data/Default/Extensions/cjpalhdlnbpafiamejdnhcphjbkeiagm/1.62.0_0");

(async () => {
    
    // Initialize Puppeteer
    const browser = await puppeteer.launch({
        headless: false, // Set to true to run headless
        args: [
            `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36`,
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
        ],
        defaultViewport: null
    })

    const extentionsPage = await browser.newPage();
    await extentionsPage.goto('chrome://extensions', { waitUntil: 'networkidle2' });

    await extentionsPage.evaluate(() => {
        document.querySelector('extensions-manager')
            .shadowRoot.querySelector('#items-list')
            .shadowRoot.querySelector('#cjpalhdlnbpafiamejdnhcphjbkeiagm')
            .shadowRoot.querySelector('#enableToggle')
            .click();
    });
    
    await keyboard.type(Key.Enter);

    await extentionsPage.close();

    const page = await browser.newPage();

    const client = await page.target().createCDPSession();

    const setDynamicDownloadPath = async (novelName) => {

        const novelFolder = path.join(downloadPath, novelName);
         // Create the folder if it doesn't exist
         await fs.promises.mkdir(novelFolder, { recursive: true });

        // Set the download path to the novel's folder
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: novelFolder, 
        });

        console.log(`Download path set to: ${novelFolder}`);
    }

    const downloadedFiles = async (novelName) => {
        
        const novelFolder = path.join(downloadPath, novelName);
        const files = fs.readdirSync(novelFolder);
        currentFilesLength = files.length;
    
        // Watch the folder for new files
        const watcher = chokidar.watch(novelFolder, {
            persistent: true,
            ignoreInitial: true, // Don't process existing files
            awaitWriteFinish: { // Wait for files to finish writing
                stabilityThreshold: 1000, // Wait 1 second after the last write event
                pollInterval: 100,
            },
        });

        watcher.on('add', (filePath) => {
            const filename = path.basename(filePath);
            
            const regex = new RegExp(`^.*_\\d+\\.pdf$`);
            if (regex.test(filename)) {
                return;
            }
            
            currentFilesLength++;
            // Determine the volume number
            const volumeNumber = currentFilesLength;
            const newFileName = `${filename.replace('.pdf', '')}_${volumeNumber}.pdf`;
            const newFilePath = path.join(novelFolder, newFileName);
    
            // Rename the file
            fs.renameSync(filePath, newFilePath);
            console.log(`Renamed: ${filename} -> ${newFileName}`);
        });
    
        watcher.on('error', (error) => {
            console.error(`Watcher error: ${error}`);
        });

        return watcher;
    }

    const AreVolumesDownloaded = async (novelName, numOfVolumes) => {
        const novelFolder = path.join(downloadPath, novelName);
        if (!fs.existsSync(novelFolder)) {
            return false;
        }

        const files = fs.readdirSync(novelFolder).filter(file => {
            const fullPath = path.join(novelFolder, file);
            return fs.statSync(fullPath).isFile();
        });

        if (files.length === numOfVolumes) {
            return true;
        }
        else {
            return false;
        }
    }

    const fileExists = async (novelName, i) => {
        const novelFolder = path.join(downloadPath, novelName);
        const files = await fs.promises.readdir(novelFolder);
        return files.some(file => new RegExp(`_${i}\\.pdf$`).test(file));

        // const novelFolder = path.join(downloadPath, novelName);
        // const files = fs.readdirSync(novelFolder);
            
        // const regex = new RegExp(`_${i}\\.pdf$`);
        // for (const filename of files) {
        //     if (regex.test(filename)) {
        //         return true;
        //     }
        // }
    }

    const keepPageActive = async (page, duration = 15000, interval = 1000) => {
        const startTime = Date.now();
        while (Date.now() - startTime < duration) {
            // Simulate a small mouse movement
            await page.mouse.move(100, 100);
            await page.mouse.move(200, 200);
    
            // Optionally click somewhere on the page (e.g., a blank area)
            await page.mouse.click(50, 50);
    
            // Add a short delay before the next interaction
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    };

    // Navigate to the main page
    const mainUrl = 'https://jnovels.com/light-novel-pdf-jp/';
    await page.goto(mainUrl, { waitUntil: 'networkidle2' });

    // Collect all novel links
    const novelUrls = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links
            .map(link => ({
                // Get the text of the link for folder naming
                title: link.textContent.trim(),
                href: link.href
            }))
            .filter(({ href }) =>
                href && (
                    (href.includes('light-novel-pdf') && !href.includes('light-novel-pdf-jp') && !href.includes('light-novel-pdf-jnovels')) ||
                    (href.includes('all-volumes-pdf') && !href.includes('light-novel-pdf-jp') && !href.includes('light-novel-pdf-jnovels')) ||
                    (href.includes('light-novel-epub') && !href.includes('light-novel-pdf-jp') && !href.includes('light-novel-pdf-jnovels')) ||
                    (href.includes('light-novel-pdfs') && !href.includes('light-novel-pdf-jp') && !href.includes('light-novel-pdf-jnovels')) ||
                    (href.endsWith('-pdf/') && !href.includes('light-novel-pdf-jp') && !href.includes('light-novel-pdf-jnovels')) ||
                    (href.endsWith('-light-novel/') && !href.includes('light-novel-pdf-jp') && !href.includes('light-novel-pdf-jnovels')) ||
                    (href.includes('light-novels-pdfs') && !href.includes('light-novel-pdf-jp') && !href.includes('light-novel-pdf-jnovels'))
                )
            );
    });

    console.log(`Found ${novelUrls.length} novel links.`);

    // Function to navigate to download pages
    const navigateToDownloadPage = async ({title, href}) => {
        try {
             // Sanitize the folder name
            const novelName = title.replace(/[\/:*?"<>|]/g, '');
            
            await page.goto(href, { waitUntil: 'networkidle2'});

            let allElements = await page.$$('.post-content');
            let moreElements = [];
            for (let element of allElements) {
                // Targets all <ol> tags
                let olElements = await element.$$('ol'); 
                if (olElements.length) {
                    // Add found <ol> elements to the array
                    moreElements.push(...olElements);
                    break;
                }
            }

            let downloadLinks = [];
            for (let expandable of moreElements) {
                // Find all `<a>` elements within `.hide-expandable`
                let anchorElements = await expandable.$$('a'); 

                for (let anchor of anchorElements) {
                    const anchorText = await (await anchor.getProperty('innerText')).jsonValue();

                    if (anchorText.trim().toUpperCase() === 'DOWNLOAD' || anchorText.trim().toUpperCase().includes('VOLUME')) {
                        // Extract the URL
                        let downloadUrl = await (await anchor.getProperty('href')).jsonValue();
                        
                        if (downloadUrl.startsWith('http://')) {
                            downloadUrl = downloadUrl.replace('http://', 'https://');
                        }
                        downloadLinks.push( {url: downloadUrl });
                    }
                    else {
                        continue;
                    }
                }
            }

            const isTrue = await AreVolumesDownloaded(novelName, downloadLinks.length);

            if (isTrue) {
                console.log(`All volumes for ${novelName} have been downloaded.`);
                return;
            }

            await setDynamicDownloadPath(novelName);

            let watcher = await downloadedFiles(novelName);

            await new Promise(resolve => setTimeout(resolve, 5000));
            
            async function openLinks(links, watcher) {
                for (let i = 1; i < links.length + 1; i++) {
                    const isFileExists = await fileExists(novelName, i);
                    if (isFileExists) {
                        console.log(`Volume ${i} for ${novelName} has been downloaded.`);
                        continue;
                    }

                    const link = links[i - 1].url;
                    console.log(`Opening link ${i + 1}: ${link}`);
                    await Promise.all([
                        page.waitForNavigation(),
                        page.goto(link),
                    ]);

                    const frameHandle = await page.waitForSelector('iframe');
                    const frame = await frameHandle.contentFrame();

                    const recaptchaCheckbox = await frame.$('#recaptcha-anchor');

                    // Click on the download buttons
                    const downloadButton = await page.$('.btn-captcha');
                    if (downloadButton) {
                        if (recaptchaCheckbox) {
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            await recaptchaCheckbox.click();
                            console.log('Clicked the reCAPTCHA checkbox.');

                            await new Promise(resolve => setTimeout(resolve, 3000));

                            const captchaOverlaySelector = 'div[style*="z-index: 2000000000;"]';

                            // Check if the `div` becomes visible
                            const captchaOverlayVisible = await page.waitForSelector(captchaOverlaySelector, { visible: true, timeout: 5000 }).catch(() => null);

                            if (captchaOverlayVisible) {
                                console.log('Captcha overlay is visible. Waiting for it to become invisible.');
                        
                                // Wait until the `div` becomes invisible
                                await page.waitForFunction(
                                    (selector) => {
                                        const el = document.querySelector(selector);
                                        return !el || el.style.visibility === 'hidden' || el.style.opacity === '0';
                                    },
                                    { timeout: 60000 },
                                    captchaOverlaySelector
                                );
                                console.log('Captcha overlay is now invisible. Continuing...');
                            } else {
                                console.log('Captcha overlay did not appear.');
                            }
                        }
                        else {
                            await new Promise(resolve => setTimeout(resolve, 15000));
                        }
                        
                        
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        await downloadButton.click();
                        console.log('Clicked the download button.');

                        await new Promise(resolve => setTimeout(async () => {
                            // Simulate interaction while waiting
                            await keepPageActive(page, 10000);
                            resolve();
                        }, 10000));
                        
                        const buttons = await page.$$('.btn-captcha');

                        // Iterate through buttons to find the one without the "disabled" class
                        let targetButton = null;
                        for (const button of buttons) {
                            const className = await (await button.getProperty('className')).jsonValue();
                            if (!className.includes('disabled')) {
                                targetButton = button;
                                break;
                            }
                        }
                        
                        await targetButton.click();

                        await new Promise(resolve => setTimeout(async () => {
                            // Simulate interaction while waiting
                            await keepPageActive(page, 15000);
                            resolve();
                        }, 15000));

                        const finalDownloadButton = await page.waitForSelector('.get-link', { visible: true });
                        if (finalDownloadButton) {
                            await finalDownloadButton.click();
                            await new Promise(resolve => setTimeout(resolve, 15000));
                            const currentUrl = page.url();
                            if (currentUrl.includes('drive.usercontent.google.com/download')) {
                                console.log('Redirected to Google Drive download page.');

                                try {
                                    // Wait for the download button to appear
                                    const driveDownloadButton = await page.waitForSelector('.jfk-button-action', { visible: true, timeout: 5000 });
                                    if (driveDownloadButton) {
                                        await driveDownloadButton.click();
                                        console.log('Clicked the Google Drive download button.');
                                        await new Promise(resolve => setTimeout(resolve, 10000));
                                    }
                                } catch (error) {
                                    console.error('Error clicking the Google Drive download button:', error);
                                }
                            } else {
                                console.log('No redirect to Google Drive detected.');
                            }
                        }
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 5000));
                // Stop watching after renaming one file
                watcher.close();
                console.log("All links processed.");
            }
            
            // Start opening links
            await openLinks(downloadLinks, watcher);
            

            
        } catch (error) {
            console.error(`Error navigating to ${url}:`, error);
        }
    };
    
    // Loop through each novel URL and process it
    for (const novelUrl of novelUrls) {
        console.log(`Processing novel: ${novelUrl.title}`);
        if (novelUrl.title === 'Ascendance of a Bookworm: Royal Academy Stories – First Year' || novelUrl.title === 'Baccano!') {
            continue;
        }
        await navigateToDownloadPage(novelUrl);
    }

    await browser.close();
})();
