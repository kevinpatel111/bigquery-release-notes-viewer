import datetime
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request
import requests
from bs4 import BeautifulSoup

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache
cache = {
    "data": None,
    "last_fetched": None
}
CACHE_DURATION = datetime.timedelta(minutes=5)

def fetch_and_parse_release_notes(bypass_cache=False):
    global cache
    now = datetime.datetime.now()
    
    # Check if cache is valid
    if not bypass_cache and cache["data"] is not None and cache["last_fetched"] is not None:
        if now - cache["last_fetched"] < CACHE_DURATION:
            print("Serving release notes from cache.")
            return cache["data"], False # False means it didn't do a fresh network request
            
    print("Fetching release notes from Google Cloud documentation feed...")
    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
        
        # Parse Atom XML feed
        root = ET.fromstring(response.content)
        
        # Atom namespace
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        entries = []
        for entry in root.findall('atom:entry', ns):
            title_el = entry.find('atom:title', ns)
            date_str = title_el.text if title_el is not None else "Unknown Date"
            
            link_el = entry.find('atom:link[@rel="alternate"]', ns)
            url = link_el.get('href') if link_el is not None else ""
            
            updated_el = entry.find('atom:updated', ns)
            updated_str = updated_el.text if updated_el is not None else ""
            
            content_el = entry.find('atom:content', ns)
            content_html = content_el.text if content_el is not None else ""
            
            # Now parse the HTML content of the entry using BeautifulSoup
            soup = BeautifulSoup(content_html, 'html.parser')
            
            # Group items by their release note headers (<h3>)
            items = []
            current_type = None
            current_elements = []
            
            h3_tags = soup.find_all('h3')
            
            if not h3_tags:
                # Fallback: treat the entire content as one update
                text_content = soup.get_text().strip()
                if text_content:
                    items.append({
                        'type': 'Update',
                        'html': str(soup),
                        'text': text_content
                    })
            else:
                # Iterate through child elements to group them by h3 header
                for element in soup.contents:
                    # Ignore empty string elements or whitespace
                    if isinstance(element, str):
                        if not element.strip():
                            continue
                        # If it is plain text, let's treat it as sibling text
                        if current_type:
                            current_elements.append(element)
                        continue
                    
                    if element.name == 'h3':
                        # Save the previous type and elements
                        if current_type and current_elements:
                            block_soup = BeautifulSoup('', 'html.parser')
                            for el in current_elements:
                                block_soup.append(el)
                            
                            items.append({
                                'type': current_type,
                                'html': str(block_soup),
                                'text': block_soup.get_text().strip()
                            })
                        current_type = element.get_text().strip()
                        current_elements = []
                    else:
                        if current_type:
                            current_elements.append(element)
                        else:
                            # Elements before the first H3 tag (if any)
                            current_type = 'Update'
                            current_elements.append(element)
                            
                # Save the final block
                if current_type and current_elements:
                    block_soup = BeautifulSoup('', 'html.parser')
                    for el in current_elements:
                        block_soup.append(el)
                    
                    items.append({
                        'type': current_type,
                        'html': str(block_soup),
                        'text': block_soup.get_text().strip()
                    })
            
            entries.append({
                'date': date_str,
                'updated': updated_str,
                'url': url,
                'items': items
            })
            
        # Update cache
        cache["data"] = entries
        cache["last_fetched"] = now
        return entries, True
        
    except Exception as e:
        print(f"Error fetching release notes: {str(e)}")
        # If fetch fails but we have cached data, fall back to it
        if cache["data"] is not None:
            print("Fetch failed. Serving stale data from cache.")
            return cache["data"], False
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    # Allow force refresh
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    
    try:
        entries, is_fresh = fetch_and_parse_release_notes(bypass_cache=force_refresh)
        return jsonify({
            "status": "success",
            "fresh": is_fresh,
            "timestamp": cache["last_fetched"].isoformat() if cache["last_fetched"] else None,
            "data": entries
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
