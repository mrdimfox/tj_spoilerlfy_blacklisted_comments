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

    const TESTING_ENTRY_ID = 221782;
    const TESTING_COMMENT_ID = 4263642;


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

    /** Check if empty object */
    const isEmpty = obj => !Object.values(obj).filter(e => typeof e !== 'undefined').length;


    /**
     * Extact hidden comments from DOM tree
     * @returns {Array<{id: Number, comment: HTMLElement}>} array of two: id number + comment DOM elem
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
     * Get comment from entry by id
     * @param {number} entry_id
     * @param {number} comment_id
     * @param {number} max_retry_count max count of retry to get message. Detault 10.
     * @returns {string} empty string if comment was not received otherwise html text of comment.
    */
    async function get_comment(entry_id, comment_id, max_retry_count = 10) {
        const request_url = request_comment_url_template(entry_id, comment_id);
        console.log(`Request: ${request_url}.`);

        // Await return respoce obj + Optional[json]
        let get_resp_json = () => fetch(request_url, { headers: HEADERS_NO_AUTH })
            .then(resp => {
                return resp.ok ? resp : Promise.reject([resp, {}]);
            })
            .then(response => {
                return Promise.all([response, response.json()]);
            }).catch(e => {
                console.log(`Fatal error: ${e.message}`);
                return Promise.reject([{}, {}]);
            });

        for (let retry_count = 0; retry_count < max_retry_count; retry_count++) {
            const [first_comment, status] = await get_resp_json()
                .then(result => {
                    const [resp, json] = result;
                    let comment = json.result.items.find((el) => el.id == comment_id);
                    return [comment, resp.status];
                })
                .catch(function (bad_result) {
                    const [resp, _] = bad_result;
                    if (!isEmpty(resp)) {
                        console.log(`Request "${request_url}" failed!`);
                        return [{}, resp.status];
                    }
                    else {
                        return [{}, {}]
                    }
                });

            // Too many requests
            if (status == 429) {
                await sleep(1000);
                console.log(`Retry ${retry_count}: ${request_url}...`)
                continue;
            }
            else if (status != 200) {
                break;
            }

            console.log(`Success "${request_url}"!`)
            return first_comment.html;
        }

        console.log(`Request "${request_url}" was not received!`)
        return "";
    }

    async function replace_hidden_comment(elem) {
        let [id, element] = elem;

        let comment = await get_comment(TESTING_ENTRY_ID, id);
        console.log(`Replacing comment ${id}...`);
        if (comment) {
            let text = element.children[0].querySelector(".comments__item__text");
            console.log(`Text of ${id}: ${comment}`);
            text.innerHTML = comment;
        }
        else {
            console.log(`Uups... comment ${id} was not replaced.`);
        }
    }

    (async () => {
        let comments = extract_comments_form_dom();
        let tasks = comments.map(async (elem) => { return replace_hidden_comment(elem) });
        await Promise.all(tasks);
    })();

})();
