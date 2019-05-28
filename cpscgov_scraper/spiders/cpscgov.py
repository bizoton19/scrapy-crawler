# -*- coding: utf-8 -*-
import scrapy
from scrapy.linkextractors import LinkExtractor
from scrapy.spiders import CrawlSpider, Rule
from cpscgov_scraper.items import CpscgovScraperItem
TEXTRACT_EXTENSIONS = [".pdf", ".doc", ".docx", ""]

class DocumentLinkExtractor(LinkExtractor):
    def __init__(self, *args, **kwargs):
        super(DocumentLinkExtractor, self).__init__(*args, **kwargs)
        # Keep the default values in "deny_extensions" *except* for those types we want.
        self.deny_extensions = [ext for ext in self.deny_extensions if ext not in TEXTRACT_EXTENSIONS]

class CpscgovSpider(CrawlSpider):
    name = 'cpscgov'
    allowed_domains = ['cpsc.gov']
    start_urls = ['https://www.cpsc.gov/About-CPSC/Commissioners/Robert-Adler/statements']

    rules = (
        Rule(
            DocumentLinkExtractor(), 
                callback='parse_items', 
                follow=True),
    )
    def start_requests(self):
        for url in self.start_urls:
            yield scrapy.Request(url, callback=self.parse,dont_filter=True)
    
    def parse_items(self, response):
        items = []
        # Only extract canonicalized and unique links (with respect to the current page)
        links = LinkExtractor(canonicalize=False, unique=True).extract_links(response)
        # Now go through all the found links
        for link in links:
            # Check whether the domain of the URL of the link is allowed; so whether it is in one of the allowed domains
            is_allowed = False
            for allowed_domain in self.allowed_domains:
                if allowed_domain in link.url:
                    is_allowed = True
            # If it is allowed, create a new item and add it to the list of found items
            if is_allowed:
                item = CpscgovScraperItem()
                item['url_from'] = response.url
                item['url_to'] = link.url
                if ".pdf" in response.url or ".pdf" in link.url:
                    print("adding link.url because it has .pdf ")
                    items.append(item)
        # Return all the found items
        return items
