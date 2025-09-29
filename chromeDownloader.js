// const puppeteer = require('puppeteer-extra');
const { connect } = require('puppeteer-real-browser');

const { keyboard, Key } = require('@nut-tree-fork/nut-js');
const { mouse, screen, Point } = require('@nut-tree-fork/nut-js');
const chokidar = require('chokidar');

const path = require('path');
const fs = require('fs');
const { get } = require('https');


let currentVolume = 0;

const downloadPath = 'F:/Light Novels/';

const pathToExtension = ("C:/Users/marti/AppData/Local/Google/Chrome/User Data/Default/Extensions/cjpalhdlnbpafiamejdnhcphjbkeiagm/1.63.3b19");


process.on('unhandledRejection', (err) => {
    if (err.message.includes('Requesting main frame too early')) {
      console.warn('⚠️ Ignored fast popup error.');
      return;
    }
    console.error('❌ Unhandled rejection:', err);
  });

(async () => {
    
    const { browser } = await connect({
        headless: 'auto', // Set to true to run headless
        fingerprint: true,
        turnstile: true,
        tf: true,
        args: [
            // `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36`,
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
        ],
        // defaultViewport: null

    })


    const extentionsPage = await browser.newPage();
    await extentionsPage.goto('chrome://extensions', { waitUntil: 'networkidle2' });

    await extentionsPage.evaluate(() => {
        document.querySelector('extensions-manager')
            .shadowRoot.querySelector('#items-list')
            .shadowRoot.querySelector('#aefhhnbmndecafhfcppknoadjjcabaal')
            .shadowRoot.querySelector('#enableToggle')
            .click();
    });

    await extentionsPage.evaluate(() => {
        document.querySelector('extensions-manager')
            .shadowRoot.querySelector('#toolbar')
            .shadowRoot.querySelector('#devMode')
            .click();
    });

    const currentPos = await mouse.getPosition();
    
    await mouse.setPosition(new Point(500, 300));
    await mouse.leftClick();
    await keyboard.type(Key.Enter);

    await mouse.setPosition(currentPos);

    await new Promise(resolve => setTimeout(resolve, 1000));

    await extentionsPage.close();

    const page = await browser.newPage();

    const client = await page.target().createCDPSession();





    const filePath = path.join(__dirname, 'Novels With More than one ol.txt');

    
    const appendNovelSection = async (sectionTitle, novelTitle) => {
        let fileContent = '';

        if (fs.existsSync(filePath)) {
            fileContent = fs.readFileSync(filePath, 'utf8');
        } else {
            fs.writeFileSync(filePath, '');
        }

        const sectionRegex = new RegExp(`${sectionTitle}:\\n([\\s\\S]*?)(?=\\n\\w|$)`, 'i');
        const match = fileContent.match(sectionRegex);

        if (match) {
            const existingSections = match[0];
            const novelsInSection = match[1];

            if (novelsInSection.includes(novelTitle)) {
                console.log(`Novel "${novelTitle}" already exists in the "${sectionTitle}" section.`);
                return;
            }

            const updatedSection = `${existingSections.trim()}\n${novelTitle}`;
            fileContent = fileContent.replace(existingSections, updatedSection);
        }
        else {
            fileContent += `\n${sectionTitle}:\n${novelTitle}\n`;
        }

        fs.writeFileSync(filePath, fileContent);
        console.log(`✅ Novel "${novelTitle}" added under "${sectionTitle}".`);
    }



    const setDynamicDownloadPath = async (novelName) => {
        const safeNovelName = novelName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\.+$/, '').trim();

        const novelFolder = path.join(downloadPath, safeNovelName);
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
            
            const regex = /^.*_\d+\.(pdf|epub)$/i;
            if (regex.test(filename)) {
                return;
            }
            
            let newFileName = '';
            if (filename.includes('.pdf')){
                newFileName = `${filename.replace('.pdf', '')}_${currentVolume}.pdf`;
            }
            else {
                newFileName = `${filename.replace('.epub', '')}_${currentVolume}.epub`;
            }
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
        const safeNovelName = novelName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\.+$/, '').trim();
        const novelFolder = path.join(downloadPath, safeNovelName);
        const files = await fs.promises.readdir(novelFolder);
        return files.some(file => new RegExp(`_${i}\\.(pdf|epub)$`).test(file));
    }

    const keepPageActive = async (page, duration = 15000, interval = 1000) => {
        const startTime = Date.now();
        while (Date.now() - startTime < duration) {
            // Simulate a small mouse movement
            await page.mouse.move(100, 100);
            await page.mouse.move(200, 200);
    
            // Optionally click somewhere on the page (e.g., a blank area)
            await page.mouse.click(100, 100);
    
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

            if (title !== 'Date A Live') {
                for (let element of allElements) {
                    let pElement = await element.$$('p');
                    let olElements = await element.$$('ol');
                    if (pElement) {
                        for (let element of pElement) {
                            const pText = await (await element.getProperty('innerText')).jsonValue();
                            if (pText.toLowerCase() === 'official version') {
                                appendNovelSection('OFFICIAL VERSION', novelName);
                                return;
                            }
                            else if (pText.toLowerCase() === 'official translation') {
                                appendNovelSection('OFFICIAL TRANSLATION', novelName);
                                return;
                            }
                            else if (pText.toLowerCase() === 'official releases') {
                                appendNovelSection('OFFICIAL RELEASES', novelName);
                                return;
                            }
                        }
                    }

                    if (olElements){
                        if (olElements.length > 1) {
                            appendNovelSection('NOVELS THAT HAVE MORE THAN ONE OL', novelName);
                            return;
                        }
                    }
                }

            }

            let moreElements = [];
            for (let element of allElements) {
                // Targets all <ol> tags
                let olElements = await element.$$('ol');

                if (title === 'Classroom Of The Elite') {
                    if (olElements.length) {
                        olElements.pop();
                        moreElements.push(...olElements);
                        break;
                    }
                }
                else if (title === 'Date A Live') {
                    if (olElements.length) {
                        olElements.shift();
                        moreElements.push(...olElements);
                    }
                }
                else {
                    if (olElements.length) {
                        moreElements.push(...olElements);
                        break;
                    }
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

                    currentVolume = i;

                    const link = links[i - 1].url;
                    if (link.includes('usheethe') || link.includes('chuxoast')) {
                        console.log(`Skipping link ${i} as it is from links: ${link}`);
                        continue;
                    }
                    console.log(`Opening link ${i + 1}: ${link}`);
                    await Promise.all([
                        page.waitForNavigation(),
                        page.goto(link),
                    ]);
                    
                    await new Promise(resolve => setTimeout(resolve, 5000));

                    const frameHandle = await page.$('#iframe');
                    const frame = null;
                    let recaptchaCheckbox = null;
                    if (frameHandle) {
                        frame = await frameHandle.contentFrame();
                    }
                    // const frameHandle = await document.querySelector('#iframe');
                    

                    if (frame) {
                        recaptchaCheckbox = await frame.$('#recaptcha-anchor');
                    }


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
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            for (let i = 0; i < 1; i++) {
                                await page.keyboard.press('Tab');
                            }
                            await page.keyboard.press('Space');
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        await downloadButton.click();
                        console.log('Clicked the download button.');

                        await new Promise(resolve => setTimeout(async () => {
                            console.log('⏳ Waiting 12 seconds and keeping page active...');
                            try {
                                await keepPageActive(page, 12000); // Make sure this function does what you expect
                            } catch (err) {
                                console.error('❌ Error during keepPageActive:', err);
                            }
                            resolve();
                        }, 12000));
                        
                        console.log('🔍 Looking for buttons with class `.btn-captcha`...');
                        const buttons = await page.$$('.btn-captcha');
                        console.log(`🧮 Found ${buttons.length} buttons.`);
                        
                        if (buttons.length === 0) {
                            console.log('❌ No buttons found after clicking the download button.');
                            continue; // or break; depending on your loop structure
                        }
                        
                        // Iterate through buttons to find the one without the "disabled" class
                        let targetButton = null;
                        for (const button of buttons) {
                            const className = await (await button.getProperty('className')).jsonValue();
                            console.log(`➡️ Button class: ${className}`);
                        
                            if (!className.includes('disabled')) {
                                // Optionally check if button is visible/enabled
                                const isVisible = await button.boundingBox() !== null;
                                if (isVisible) {
                                    console.log('✅ Found a clickable button!');
                                    targetButton = button;
                                    break;
                                } else {
                                    console.log('⚠️ Button is not visible on screen.');
                                }
                            } else {
                                console.log('⛔ Button is disabled.');
                            }
                        }
                        
                        if (!targetButton) {
                            console.log('❌ No enabled, visible target button found.');
                            // Optionally take a screenshot to debug
                            await page.screenshot({ path: 'debug_no_button.png' });
                            break; // Or handle it however you need
                        }
                        await page.screenshot({ path: 'second_debug_no_button.png' });
                        console.log('🖱️ Clicking target button...');
                        await targetButton.click();

                        await new Promise(resolve => setTimeout(resolve, 3000));

                        // browser.on('targetcreated', (target) => {
                        //     console.log('🎯 Target created:', target.url(), 'Type:', target.type());
                        // });
                        
                        // browser.on('targetdestroyed', (target) => {
                        //     console.log('💀 Target destroyed:', target.url(), 'Type:', target.type());
                        // });

                        // process.on('unhandledRejection', (err) => {
                        //     if (err.message.includes('Requesting main frame too early')) {
                        //         console.warn('⚠️ Ignored fast popup error.');
                        //         return;
                        //     }
                        //     console.error('❌ Unhandled rejection:', err);
                        // });
                        
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        for (let i = 0; i < 7; i++) {
                            await page.keyboard.press('Tab');
                        }
                        await page.keyboard.press('Enter');
                        
                        await new Promise(resolve => setTimeout(async () => {
                            // Simulate interaction while waiting
                            await keepPageActive(page, 15000);
                            resolve();
                        }, 15000));
                        
                        const finalDownloadButton = await page.waitForSelector('.get-link', { visible: true });

                        const button_className = await (await finalDownloadButton.getProperty('className')).jsonValue();
                        console.log(`➡️ Final button class: ${button_className}`);

                        if (finalDownloadButton) {
                            await page.screenshot({ path: 'second_debug_no_button.png' });
                            
                            await finalDownloadButton.click();
                            await new Promise(resolve => setTimeout(resolve, 10000));
                            const currentUrl = page.url();
                            console.log('🌐 Current URL:', currentUrl);
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
                                await new Promise(resolve => setTimeout(resolve, 15000));
                                console.log('No redirect to Google Drive detected.');
                            }

                        }
                        else {
                            await page.screenshot({ path: 'second_debug_no_button.png' });
                            
                            console.log('❌ Final download button not found.');

                            console.log('🌐 Current URL:', page.url());
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
        if (novelUrl.title === 'Ascendance of a Bookworm: Royal Academy Stories – First Year' || novelUrl.title === 'Baccano!'
             || novelUrl.title === 'Boku no Hero Academia Yuuei Hakusho' || novelUrl.title === 'Boku no Imouto wa Kanji ga Yomeru' 
             || novelUrl.title === 'Boogiepop and Others' || novelUrl.title === 'Boogiepop' || novelUrl.title === 'Akaoni Contract with a Vampire'
             || novelUrl.title === 'Boogiepop Returns: VS Imaginator' || novelUrl.title === 'Harem Castle' || novelUrl.title === 'Harem Dynast'
             || novelUrl.title === 'Harem Pirates' || novelUrl.title === 'Harem Sister' || novelUrl.title === 'Bokutachi wa Benkyou ga Dekinai Short Story Collection'
            || novelUrl.title === 'Maoyuu Maou Yuusha' || novelUrl.title === 'Mardock Scramble' || novelUrl.title === 'Ecstas Online' || novelUrl.title === 'I Adopted a Villainous Dad'
            || novelUrl.title === 'Milk Princess') {
            continue;
        }

        //Code for testing specific link
        // link = {
        //     title: 'Isekai wa Smartphone to Tomo ni',
        //     href: "http://jnovels.com/download-in-another-world-with-smartphone-all-volumes-pdfs/"
        // };
        // await navigateToDownloadPage(link);

        await navigateToDownloadPage(novelUrl);
    }

    await browser.close();
})();
