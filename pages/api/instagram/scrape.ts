import dayjs from 'dayjs';
import { NextApiRequest, NextApiResponse } from 'next';

// Interface defining the structure of an Instagram post object
interface InstagramPost {
    id: number;
    text: string;
    thumbnail_src: string;
    display_url: string;
    shortcode: string;
    base64: string;
    created_at: string;
}

// Interface defining the structure of the response data
interface ResponseData {
    first: number;
    total: number;
    result?: any;
}

// Simple in-memory cache to store requests and responses
const cache = new Map<string, { timestamp: number, data: ResponseData }>();

// Default export of the Next.js API route handler
export default async (req: NextApiRequest, res: NextApiResponse) => {
    // Manually set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');  // Allow any origin
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');  // Allow specific methods
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');  // Allow specific headers

    // If the request method is OPTIONS, return a 200 response for pre-flight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Extracting profile_id and the number of posts to fetch (first) from the request body
    const { profile_id, first } = req.body;

    // Check if profile_id is null or empty
    if (!profile_id) {
        return res.status(400).json({
            error: "Profile ID is required and cannot be empty.",
            message: "Please provide a valid Instagram profile ID."
        });
    }

    // Set default value for 'first' to 10 if it's null or undefined
    const numberOfPosts = first ?? 10;
    const cacheKey = `${profile_id}:${numberOfPosts}`;

    // Check cache for existing data
    const cachedData = cache.get(cacheKey);

    // If cached data exists and it's less than 12 hours old, return it
    if (cachedData && (Date.now() - cachedData.timestamp) < 24 * 60 * 60 * 1000) {
        console.log("Returning cached data");
        return res.status(200).json(cachedData.data);
    }

    // Array to store the processed Instagram posts
    let posts: InstagramPost[] = [];

    // Object to store the response data
    let response: ResponseData = {} as ResponseData;

    // Constructing the URL using template literals to include the profile ID and the number of posts
    const url = `https://www.instagram.com/graphql/query/?query_id=17888483320059182&variables={"id":"${profile_id}","first":${numberOfPosts},"after":null}`;

    console.log(url);

    // Fetching the data from the Instagram GraphQL API
    const result = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
        }
    }).then(res => res.json());
    console.log(JSON.stringify(result));

    // Storing the number of posts retrieved and the total count of posts
    response.first = result.data.user.edge_owner_to_timeline_media.edges.length;
    response.total = result.data.user.edge_owner_to_timeline_media.count;

    // Helper function to fetch and convert image data to base64 format
    async function getData(displayUrl: string): Promise<string> {
        const img = await fetch(displayUrl)
            .then(res => res.arrayBuffer()) // Convert the response to an array buffer
            .then(arrayBuffer => Buffer.from(arrayBuffer)) // Convert the array buffer to a Buffer
            .then(buffer => buffer.toString('base64')); // Convert the buffer to base64 string
        return img;
    }

    // Loop through the retrieved posts and process each one
    for (let i = 0; i < response.first; i++) {
        // Get the display URL for the current post
        const displayUrl = result.data.user.edge_owner_to_timeline_media.edges[i].node.display_url;

        // Fetch the base64 encoded image data
        const base64 = await getData(displayUrl);

        // Create an InstagramPost object with the necessary details
        const post: InstagramPost = {
            id: i,
            text: result.data.user.edge_owner_to_timeline_media.edges[i].node.edge_media_to_caption.edges[0].node.text,
            thumbnail_src: result.data.user.edge_owner_to_timeline_media.edges[i].node.thumbnail_src,
            display_url: displayUrl,
            shortcode: result.data.user.edge_owner_to_timeline_media.edges[i].node.shortcode,
            base64: base64,
            created_at: dayjs.unix(result.data.user.edge_owner_to_timeline_media.edges[i].node.taken_at_timestamp).format('DD-MMM-YYYY') // Formatting the timestamp to a readable date
        };

        // Add the post to the posts array, placing it at the start (newest first)
        posts.unshift(post);
    }

    // Attach the processed posts to the response object
    response.result = posts;

    // Store the response in the cache with the current timestamp
    cache.set(cacheKey, { timestamp: Date.now(), data: response });

    // Return the response with status 200 (OK)
    return res.status(200).json(response);
};
