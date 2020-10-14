// ==UserScript==
// @name         Spoilerlfy blacklistted commets
// @namespace    https://tjornal.ru/
// @version      0.1
// @description  replace hidden comments from block list with comments under spoiler.
// @author       mrdimlis
// @match        https://tjournal.ru/*
// @connect      https://tjournal.ru
// @grant        GM_xmlhttpRequest
// @require      https://raw.githubusercontent.com/mitchellmebane/GM_fetch/master/GM_fetch.min.js
// ==/UserScript==


(function () {
    'use strict';

    let fetch = GM_fetch;

    const API_VER = '1.8';
    const API_URL = `https://api.tjournal.ru/v${API_VER}`;

    const APP_NAME = 'TjSpoilerlfyBlacklistedComments';
    const VERSION = "0.1.0";

    const HEADERS_NO_AUTH = {
        'User-Agent': `${APP_NAME}-app/${VERSION}`
    };


    /**
     * Return URL for requesting comment from entry
     * @param {number} entry_id
     * @param {number} comment_id
    */
    let request_comment_url_template =
        (entry_id, comment_id) => `${API_URL}/entry/${entry_id}/comments/thread/${comment_id}`;


    /**
     * Suspend thread for a little
     * @param {number} t time in msec
    */
    const sleep = (t) => ({ then: (r) => setTimeout(r, t) })


    /**
     * Extact hidden comments from DOM tree
     * @returns {Array.<{id: number, comment: HTMLElement}>} array of two: id number + comment DOM elem
     */
    function extract_comments_form_dom() {
        const comment_elems = document.querySelectorAll(".comments__item")

        let hidden_comment_elems = Array.from(comment_elems).filter(element => {
            // Check only first child to ignore all answers
            return element.children[0].querySelector(".comments__item__self--ignored");
        });

        let comments = hidden_comment_elems.map((element) => {
            return [
                element.dataset.id,
                element
            ]
        });

        return comments;
    }

    /**
     * Fetch data by URL and return optional json + responce status
     * @param {string} request_url API request url
     * @returns {Promise<{json: ?Object.<string, string>, status: number}>}
     */
    async function get_resp_json(request_url) {
        let resp = await fetch(request_url, { headers: HEADERS_NO_AUTH });
        if (resp.ok) {
            return { json: await resp.json(), status: resp.status };
        }
        else {
            return { json: null, status: resp.status };
        }
    }

    /**
     * Get comment from entry by id
     * @param {number} entry_id
     * @param {number} comment_id
     * @param {number} max_retry_cnt max count of retry to get message. Detault 10.
     * @returns {Promise<string>} error string if comment was not received otherwise html text of comment.
    */
    async function get_comment(entry_id, comment_id, max_retry_cnt = 10) {
        const request_url = request_comment_url_template(entry_id, comment_id);
        console.log(`Request: ${request_url}.`);

        for (let retry_cnt = 0; retry_cnt < max_retry_cnt; retry_cnt++) {
            try {
                const result = await get_resp_json(request_url);

                if (result.status == 200) {
                    let thread = result.json.result.items;
                    let comment = thread.find((el) => el.id == comment_id);

                    console.log(`Success "${request_url}"!`)

                    return comment.html;
                }

                if (result.status == 429) { // too many requests to server
                    await sleep(1000);
                    console.log(`Retry ${retry_cnt}: ${request_url}...`)
                    continue;
                }

                return Promise.reject(
                    `Request "${request_url}" was not received! ` +
                    `Status ${result.status}`)
            }
            catch (error) {
                return Promise.reject(
                    `Request "${request_url}" failed! ` +
                    `Error: ${error.message}`);
            }
        }
    }

    async function replace_hidden_comment(entry_id, comment_elem) {
        let [id, element] = comment_elem;

        await get_comment(entry_id, id).then(
            (comment) => {
                console.log(`Replacing comment ${id}...`);
                if (comment) {
                    let text = element
                        .children[0]
                        .querySelector(".comments__item__text");

                    console.log(`Text of ${id}: ${comment}`);
                    text.innerHTML = comment;
                }
            }
        ).catch((error) => {
            console.log(
                `Uups... comment ${id} was not replaced. ` +
                `Error:\n  ${error}`);
        });
    }

    /**
     * Return current entry id
     * @returns {?number}
     */
    function get_entry_id() {
        const entry = document.querySelector(".l-entry");
        if (entry) {
            return entry.dataset.contentId;
        }

        return null;
    }

    (async () => {
        const entry_id = get_entry_id();
        if (entry_id) {
            let comments = extract_comments_form_dom();

            let tasks = comments.map(async (elem) => {
                return replace_hidden_comment(entry_id, elem);
            });

            await Promise.all(tasks);
        }
    })();

})();
