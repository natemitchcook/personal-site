"""Private website starter files and requested transactional delivery via Resend."""
import base64
import hashlib
import html
import http.client
import ipaddress
import json
import os
import re
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser

import boto3
from boto3.dynamodb.conditions import Attr

AGENT = 'WelviaReviewBot'
MAX_BYTES = 750_000


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def canonical(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
        raise ValueError('A public website URL is required.')
    if p.port not in (None, 80, 443):
        raise ValueError('Only standard website ports are supported.')
    host = p.hostname.encode('idna').decode('ascii').lower()
    if ':' in host or not re.fullmatch(r'[a-z0-9.-]+', host):
        raise ValueError('Unsupported hostname.')
    return urllib.parse.urlunsplit(('https', host, p.path or '/', '', ''))


class PublicHTTPS(http.client.HTTPSConnection):
    """Pin the validated public address while preserving TLS hostname verification."""
    def connect(self):
        addresses = socket.getaddrinfo(self.host, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise ValueError('Website does not resolve exclusively to public addresses.')
        raw = socket.create_connection((addresses[0][4][0], 443), timeout=6)
        try:
            self.sock = ssl.create_default_context().wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def fetch(url, redirects=0):
    url = canonical(url)
    p = urllib.parse.urlsplit(url)
    connection = PublicHTTPS(p.hostname, timeout=6)
    try:
        connection.request('GET', p.path or '/', headers={'User-Agent': AGENT + '/1.0', 'Accept-Encoding': 'identity'})
        reply = connection.getresponse()
        if reply.status in (301, 302, 303, 307, 308):
            if redirects >= 3:
                raise ValueError('Too many redirects.')
            return fetch(urllib.parse.urljoin(url, reply.getheader('Location', '')), redirects + 1)
        if reply.status != 200:
            raise ValueError('Website returned HTTP ' + str(reply.status))
        if reply.getheader('Content-Encoding', 'identity') != 'identity':
            raise ValueError('Unsupported compressed response.')
        body = reply.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError('Website page is too large.')
        return url, reply.getheader('Content-Type', ''), body.decode('utf-8', errors='replace')
    finally:
        connection.close()


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ''
        self.description = ''
        self.links = []
        self.in_title = False
        self.anchor = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title':
            self.in_title = True
        if tag == 'meta' and a.get('name', '').lower() == 'description':
            self.description = a.get('content', '')
        if tag == 'a':
            self.anchor = [a.get('href', ''), '']

    def handle_data(self, text):
        if self.in_title:
            self.title += text
        if self.anchor is not None:
            self.anchor[1] += text

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag == 'a' and self.anchor is not None:
            self.links.append(self.anchor)
            self.anchor = None


def clean(value, limit=300):
    return re.sub(r'[\[\]<>`\\]', '', ' '.join(value.split()))[:limit]


def usable(artifact, fresh=True):
    if not artifact or (fresh and artifact.get('prepared_at', 0) <= time.time() - 30 * 86400):
        return False
    name = artifact.get('name', '')
    return bool(name and not re.search(r'^(site unavailable|website unavailable|access denied|just a moment|attention required|verify you are human|403 forbidden|404 not found)', name, re.I))


def prepare(db, url, force=False):
    url = canonical(url)
    key = 'REVIEW#' + digest(url)
    cached = db.get_item(Key={'pk': key}, ConsistentRead=True).get('Item')
    if not force and usable(cached):
        return cached
    origin = urllib.parse.urlsplit(url)
    robots_url = urllib.parse.urlunsplit((origin.scheme, origin.netloc, '/robots.txt', '', ''))
    try:
        _, _, robots = fetch(robots_url)
    except ValueError as error:
        # RFC 9309: unavailable robots (4xx) permits crawling; rate limits do not.
        if str(error) not in ('Website returned HTTP 401', 'Website returned HTTP 403', 'Website returned HTTP 404', 'Website returned HTTP 410'):
            raise
    else:
        policy = urllib.robotparser.RobotFileParser()
        policy.parse(robots.splitlines())
        if not policy.can_fetch(AGENT, url):
            raise ValueError('Website robots policy requires a manual review.')
    final_url, content_type, document = fetch(url)
    if 'text/html' not in content_type:
        raise ValueError('The website did not return an HTML page.')
    page = Page()
    page.feed(document)
    name = clean(page.title, 150)
    if not usable({'name': name, 'prepared_at': int(time.time())}):
        raise ValueError('The website needs manual review: missing title or unavailable/challenge page.')
    links = []
    seen = {final_url}
    for href, label in page.links:
        if not re.search(r'menu|cater|book|reserv|contact|service|about|order|location|hour', label + ' ' + href, re.I):
            continue
        try:
            target = canonical(urllib.parse.urljoin(final_url, href))
        except (ValueError, UnicodeError):
            continue
        if urllib.parse.urlsplit(target).hostname != urllib.parse.urlsplit(final_url).hostname or target in seen:
            continue
        seen.add(target)
        links.append((clean(label, 100) or 'Business information', target))
        if len(links) >= 12:
            break
    summary = clean(page.description, 600)
    llms = '# ' + name + '\n\n'
    if summary:
        llms += '> ' + summary + '\n\n'
    llms += '## Website\n\n- [Official website](' + final_url + ')\n'
    if links:
        llms += '\n## Business information\n\n' + ''.join('- [' + label + '](' + target + ')\n' for label, target in links)
    llms += '\n## Using this information\n\nConsult the linked pages for current information. Confirm availability, pricing and requests with the business. This file does not authorize transactions.\n'
    recommendations = [
        'Review the attached title, description and links before publishing; correct anything that is outdated.',
        'Keep services, service area, hours and contact details clear and consistent on your website.',
        'Make booking, ordering or inquiry steps explicit, including what the customer must confirm.'
    ]
    if not links:
        recommendations.insert(0, 'The homepage did not expose recognizable service or contact links to this check. Add clear links to those pages.')
    if not summary:
        recommendations.insert(0, 'The homepage has no readable meta description. Add a short factual business description.')
    artifact = {'pk': key, 'url': url, 'source_url': final_url, 'name': name, 'llms_txt': llms,
                'recommendations': recommendations, 'prepared_at': int(time.time()), 'version': digest(llms),
                'scope': 'Homepage title, description and same-site navigation links; linked pages and booking flows were not tested.'}
    db.put_item(Item=artifact)
    return artifact


def business_identity(db, bid):
    """Whitelist public research only; never include contacts, notes or owner answers."""
    business = db.get_item(Key={'pk': 'BUSINESS#' + bid}, ConsistentRead=True).get('Item') or {}
    prospect = db.get_item(Key={'pk': 'PROSPECT#' + bid}, ConsistentRead=True).get('Item') or {}
    fields = prospect.get('fields', {})
    if business.get('is_demo'):
        raise ValueError('Fictional demo is excluded from prospect preparation.')
    name = clean(fields.get('business_name') or business.get('name', ''), 150)
    url = canonical(fields.get('website_url') or business.get('site', ''))
    if not name:
        raise ValueError('Business name is missing.')
    sources = [x.get('url', '') for x in business.get('sources', []) if isinstance(x, dict)]
    sources += re.findall(r'https?://[^\s;|]+', str(fields.get('source_urls', '')))
    return {'name': name, 'url': url,
            'category': clean(fields.get('category') or business.get('category', ''), 150),
            'city': clean(fields.get('city') or business.get('city', ''), 100),
            'state': clean(fields.get('state') or business.get('state', ''), 100),
            'sources': sources}


def prepare_business(db, bid, refresh=False):
    identity = business_identity(db, bid)
    url = identity['url']
    key = 'REVIEW#' + digest(url)
    cached = db.get_item(Key={'pk': key}, ConsistentRead=True).get('Item')
    # Existing files stay deliverable. Refresh is a separate staff operation, not
    # a network dependency on the prospect's request. Email shows preparation date.
    if not refresh and usable(cached, fresh=False):
        artifact = cached
    else:
        try:
            artifact = prepare(db, url, force=True)
            artifact['preparation_mode'] = 'homepage'
        except (ValueError, OSError, http.client.HTTPException):
            name = identity['name']
            location = ', '.join(x for x in [identity['city'], identity['state']] if x)
            llms = '# ' + name + '\n\n'
            summary = '. '.join(x for x in [identity['category'], location] if x)
            if summary:
                llms += '> ' + summary + '.\n\n'
            llms += '## Website\n\n- [Official website](' + url + ')\n'
            links = []
            for source in identity['sources']:
                try:
                    link = canonical(source)
                except (ValueError, UnicodeError):
                    continue
                host = urllib.parse.urlsplit(link).hostname.removeprefix('www.')
                if host != urllib.parse.urlsplit(url).hostname.removeprefix('www.') or link == url or link in links:
                    continue
                links.append(link)
            if links:
                llms += '\n## Previously researched business pages\n\n'
                llms += ''.join('- [Business information](' + link + ')\n' for link in links[:10])
            llms += ('\n## Information status\n\nThis starter file is based on prior public business research. '
                     'The live website could not be fully checked during preparation. Verify the business details and linked pages before publishing. '
                     'Confirm current services, hours, prices, availability and requests directly with the business. This file does not authorize transactions.\n')
            artifact = {'pk': key, 'url': url, 'source_url': url, 'name': name, 'llms_txt': llms,
                        'prepared_at': int(time.time()), 'version': digest(llms), 'preparation_mode': 'public_research',
                        'scope': 'Prepared from prior public business research. We could not complete a live homepage check, so please verify the details and links before uploading.',
                        'recommendations': [
                            'Confirm the business name, location, service category and links in your starter file before publishing.',
                            'Make services, hours, service area and contact information clear and consistent on your website.',
                            'Keep booking, ordering or inquiry instructions explicit, including what customers must confirm.',
                            'Reply if you want help checking website access and preparing more detailed information or agent actions.'
                        ]}
        db.put_item(Item=artifact)
    db.put_item(Item={'pk': 'PREPARATION#' + bid, 'business_id': bid, 'review_key': artifact['pk'],
                      'state': 'Ready', 'prepared_at': artifact['prepared_at'], 'version': artifact['version'],
                      'preparation_mode': artifact.get('preparation_mode', 'homepage')})
    return artifact


def email_payload(lead, artifact):
    """One universal, transactional free-review email for general and business pages."""
    reply_to = os.environ.get('REVIEW_REPLY_TO', 'natemitchcook@gmail.com')
    subject = 'Your free website review and llms.txt starter file'
    prepared = time.strftime('%B %d, %Y', time.gmtime(int(artifact.get('prepared_at', time.time()))))
    scope = artifact['scope'] + ' Starter file prepared ' + prepared + '.'
    target = urllib.parse.urlunsplit((*urllib.parse.urlsplit(artifact['source_url'])[:2], '/llms.txt', '', ''))
    instructions = [
        'Download the attached llms.txt and review its facts and links. If your website already has this file, keep a backup and merge useful existing information instead of overwriting it.',
        'Ask your website provider to upload it as a plain text file at the root of your website, keeping the exact filename llms.txt.',
        'Open ' + target + ' in a private browser window. It should show the text directly without a login.',
        'If your website builder cannot publish a root-level text file, reply to this email. We can help find the right approach.'
    ]
    feedback_intro = ("I'm building Welvia to make life easier for small-business owners, "
                      "and I'm still learning where I can be most useful.")
    feedback_questions = [
        'Was anything about this review confusing or not useful?',
        'Were you able to add the file to your website? If not, what stopped you?',
        "What's one task you're trying to get done for your business that you'd consider paying someone to take off your plate?"
    ]
    feedback_after = ("It doesn't even have to involve AI. You can reply to just one question. "
                      "Even if Welvia isn't useful to you right now, I'd genuinely appreciate knowing why.")
    cta = ("And if you'd rather have me handle the setup, just say the word. "
           "We can discuss what you need before agreeing on any paid work.")
    limitation = ('This is a starter map of your website, not a guarantee that AI assistants will read it or recommend your business. '
                  'It does not enable bookings or purchases by itself.')
    feedback_link = ('mailto:' + urllib.parse.quote(reply_to, safe='@+.')
                     + '?' + urllib.parse.urlencode({'subject': 'Feedback on my free Welvia review',
                         'body': 'Hi Nate,\n\n' + '\n\n'.join(feedback_questions) + '\n\nMy thoughts: '}))
    text = ('Hi there,\n\nYour free Welvia website review is ready!\n\n'
            "I've attached your starter llms.txt file, along with recommendations and instructions for adding it to your website.\n\n"
            'Website: ' + artifact['source_url'] + '\n\n' + scope +
            '\n\nRecommendations\n' + '\n'.join('- ' + x for x in artifact['recommendations']) +
            '\n\nHow to add your file\n' + '\n'.join(str(i+1) + '. ' + x for i, x in enumerate(instructions)) +
            '\n\n' + limitation +
            '\n\nCan I ask you something?\n\n' + feedback_intro +
            "\n\nI'd love your honest feedback:\n" +
            '\n'.join(str(i+1) + '. ' + q for i, q in enumerate(feedback_questions)) +
            '\n\n' + feedback_after + '\n\n' + cta +
            '\n\nThanks,\nNate Cook\nFounder, Welvia\n\n'
            'You requested this free review. Reply if you want us to stop following up.')
    e = html.escape
    body = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        '<title>Your Welvia website review</title></head>'
        '<body style="margin:0;background-color:#f6f5f1;color:#18231f;font-family:Arial,Helvetica,sans-serif;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f5f1" '
        'style="width:100%;background-color:#f6f5f1;"><tr><td align="center" style="padding:28px 18px;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        'style="width:100%;max-width:620px;background-color:#ffffff;border-radius:18px;">'
        '<tr><td style="padding:32px 32px 10px;">'
        '<img src="https://welvia.natemitchcook.com/brand/icon-192.png" width="44" height="44" border="0" '
        'style="display:block;width:44px;height:44px;" alt="Welvia">'
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;color:#18231f;font-weight:bold;margin:8px 0 22px;">welvia</p>'
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#18231f;">Hi there,</p>'
        '<h1 style="font-family:Arial,Helvetica,sans-serif;font-size:29px;line-height:36px;color:#18231f;margin:0 0 14px;">Your free website review is ready!</h1>'
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#18231f;">'
        "I've attached your starter <strong>llms.txt</strong> file, along with recommendations and instructions for adding it to your website.</p>"
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:22px;color:#52685b;">Website: '
        + e(artifact['source_url']) + '<br>' + e(scope) + '</p>'
        '<h2 style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:29px;color:#18231f;">What we recommend</h2>'
        '<ul style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#18231f;">'
        + ''.join('<li style="margin-bottom:8px;">' + e(x) + '</li>' for x in artifact['recommendations']) + '</ul>'
        '<h2 style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:29px;color:#18231f;">How to add your file</h2>'
        '<ol style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#18231f;">'
        + ''.join('<li style="margin-bottom:8px;">' + e(x) + '</li>' for x in instructions) + '</ol>'
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#52685b;">' + e(limitation) + '</p>'
        '</td></tr><tr><td bgcolor="#e6ece5" style="padding:22px 32px;background-color:#e6ece5;">'
        '<h2 style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:30px;color:#18231f;margin:0 0 12px;">Can I ask you something?</h2>'
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#18231f;">' + e(feedback_intro) + '</p>'
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#18231f;">I&#39;d love your honest feedback:</p>'
        '<ol style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#18231f;">'
        + ''.join('<li style="margin-bottom:8px;">' + e(q) + '</li>' for q in feedback_questions) + '</ol>'
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#18231f;">' + e(feedback_after) + '</p>'
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#326450" '
        'style="border-radius:12px;background-color:#326450;"><a href="' + e(feedback_link, quote=True) + '" '
        'style="display:block;padding:13px 19px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#ffffff;text-decoration:none;font-weight:bold;">'
        'Reply with feedback</a></td></tr></table></td></tr>'
        '<tr><td style="padding:22px 32px 32px;">'
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#18231f;">' + e(cta) + '</p>'
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#18231f;">'
        'Thanks,<br>Nate Cook<br>Founder, Welvia</p>'
        '<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#52685b;">'
        'You requested this free review. Reply if you want us to stop following up.</p>'
        '</td></tr></table></td></tr></table></body></html>'
    )
    return {'from': 'Nate at Welvia <hello@welvia.natemitchcook.com>',
            'to': [lead['answers']['contact_email'].strip()],
            'reply_to': reply_to, 'subject': subject, 'html': body, 'text': text,
            'attachments': [{'filename': 'llms.txt', 'content': base64.b64encode(artifact['llms_txt'].encode()).decode()}]}


# Shared source: Resend draft welvia-current-acquisition (2026-10-27).
# Keep this renderer as the source for future acquisition sends and previews.
ACQUISITION_HTML = "<!DOCTYPE html><html lang=\"en\" dir=\"ltr\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\"><title>A practical AI plan for {{{BUSINESS_SHORT_NAME}}}</title></head><body style=\"margin-top:0;margin-bottom:0;margin-left:0;margin-right:0;background-color:#f6f5f1;\"><span style=\"display:none;font-size:1px;line-height:1px;color:#f6f5f1;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;\">{{{PREHEADER}}}</span><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background-color:#f6f5f1;\">\n<tr><td bgcolor=\"#f6f5f1\" style=\"background-color:#f6f5f1;padding-top:32px;padding-bottom:32px;padding-left:24px;padding-right:24px;\"><table role=\"presentation\" align=\"center\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;max-width:720px;\"><tr><td><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td width=\"40\"><img src=\"https://welvia.natemitchcook.com/brand/icon-192.png\" alt=\"Welvia Current mark\" width=\"32\" height=\"32\" border=\"0\" style=\"display:block;width:32px;height:32px;\"></td><td style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:30px;line-height:36px;font-weight:700;letter-spacing:-1.5px;\">welvia</td></tr></table></td></tr></table></td></tr>\n<tr><td bgcolor=\"#f6f5f1\" style=\"background-color:#f6f5f1;padding-top:32px;padding-bottom:32px;padding-left:24px;padding-right:24px;\"><table role=\"presentation\" align=\"center\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;max-width:720px;\"><tr><td><h1 style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:44px;line-height:48px;font-weight:700;letter-spacing:-2px;margin-top:0;margin-bottom:24px;\">{{{HEADLINE}}}</h1><p style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:17px;line-height:27px;margin-top:0;margin-bottom:20px;\">Hi {{{BUSINESS_SHORT_NAME}}} team,</p><p style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:17px;line-height:27px;margin-top:0;margin-bottom:20px;\">{{{INTRO}}}</p><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\"><tr><td bgcolor=\"#18231f\" align=\"center\" style=\"background-color:#18231f;border-radius:28px;\"><a href=\"{{{BUSINESS_URL}}}\" style=\"display:block;padding-top:18px;padding-bottom:18px;padding-left:22px;padding-right:22px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:700;color:#ffffff;text-decoration:none;\">See {{{BUSINESS_SHORT_NAME}}}’s plan &rarr;</a></td></tr></table><p style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:13px;line-height:20px;margin-top:12px;margin-bottom:0;text-align:center;\">Made for your business. No login. No commitment.</p></td></tr></table></td></tr>\n<tr><td bgcolor=\"#e6ece5\" style=\"background-color:#e6ece5;padding-top:32px;padding-bottom:32px;padding-left:24px;padding-right:24px;\"><table role=\"presentation\" align=\"center\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;max-width:720px;\"><tr><td><h2 style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:27px;line-height:33px;letter-spacing:-0.8px;margin-top:0;margin-bottom:24px;\">A useful place to start.</h2><h3 style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:19px;line-height:26px;margin-top:0;margin-bottom:8px;\">{{{BENEFIT_ONE_TITLE}}}</h3><p style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:17px;line-height:27px;margin-top:0;margin-bottom:20px;\">{{{BENEFIT_ONE_BODY}}}</p><h3 style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:19px;line-height:26px;margin-top:24px;margin-bottom:8px;\">{{{BENEFIT_TWO_TITLE}}}</h3><p style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:17px;line-height:27px;margin-top:0;margin-bottom:20px;\">{{{BENEFIT_TWO_BODY}}}</p><p style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:17px;line-height:27px;margin-top:0;margin-bottom:20px;\">{{{CONTROL_NOTE}}}</p></td></tr></table></td></tr>\n<tr><td bgcolor=\"#f6f5f1\" style=\"background-color:#f6f5f1;padding-top:32px;padding-bottom:32px;padding-left:24px;padding-right:24px;\"><table role=\"presentation\" align=\"center\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;max-width:720px;\"><tr><td><p style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:17px;line-height:27px;margin-top:0;margin-bottom:20px;\">I’m building Welvia so small businesses can take part as AI assistants become another way people find services and get things done. We improve the business information and next steps on your existing website.</p><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\"><tr><td bgcolor=\"#18231f\" align=\"center\" style=\"background-color:#18231f;border-radius:28px;\"><a href=\"{{{BUSINESS_URL}}}\" style=\"display:block;padding-top:18px;padding-bottom:18px;padding-left:22px;padding-right:22px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:700;color:#ffffff;text-decoration:none;\">See {{{BUSINESS_SHORT_NAME}}}’s plan &rarr;</a></td></tr></table><p style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:16px;line-height:25px;margin-top:24px;margin-bottom:0;\">Nate<br><strong>Founder, Welvia</strong></p></td></tr></table></td></tr>\n<tr><td bgcolor=\"#f6f5f1\" style=\"background-color:#f6f5f1;padding-top:32px;padding-bottom:32px;padding-left:24px;padding-right:24px;\"><table role=\"presentation\" align=\"center\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;max-width:720px;\"><tr><td><p style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:12px;line-height:19px;margin-top:0;margin-bottom:8px;\">Welvia · A proposal for {{{BUSINESS_SHORT_NAME}}}<br>{{{MAILING_ADDRESS}}}</p><p style=\"font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:12px;line-height:19px;margin-top:0;margin-bottom:0;\"><a href=\"{{{UNSUBSCRIBE_URL}}}\" style=\"color:#487663;font-size:12px;line-height:19px;\">No more emails like this</a> &nbsp;·&nbsp; <a href=\"https://welvia.natemitchcook.com/privacy.html\" style=\"color:#487663;font-size:12px;line-height:19px;\">Privacy</a></p></td></tr></table></td></tr>\n</table></body></html>"
ACQUISITION_TEXT = "{{{PREHEADER}}}\n\nwelvia\n\n\n{{{HEADLINE}}}\n\nHi {{{BUSINESS_SHORT_NAME}}} team,\n\n{{{INTRO}}}\n\nSee {{{BUSINESS_SHORT_NAME}}}’s plan → {{{BUSINESS_URL}}}\n\nMade for your business. No login. No commitment.\n\n\nA USEFUL PLACE TO START.\n\n\n{{{BENEFIT_ONE_TITLE}}}\n\n{{{BENEFIT_ONE_BODY}}}\n\n\n{{{BENEFIT_TWO_TITLE}}}\n\n{{{BENEFIT_TWO_BODY}}}\n\n{{{CONTROL_NOTE}}}\n\nI’m building Welvia so small businesses can take part as AI assistants become\nanother way people find services and get things done. We improve the business\ninformation and next steps on your existing website.\n\nSee {{{BUSINESS_SHORT_NAME}}}’s plan → {{{BUSINESS_URL}}}\n\nNate\nFounder, Welvia\n\nWelvia · A proposal for {{{BUSINESS_SHORT_NAME}}}\n{{{MAILING_ADDRESS}}}\n\nNo more emails like this {{{UNSUBSCRIBE_URL}}}  ·  Privacy\nhttps://welvia.natemitchcook.com/privacy.html"

def acquisition_payload(business, recipient='recipient@example.com'):
    campaign = business.get('campaign') or {}
    name = business['name']
    url = 'https://welvia.natemitchcook.com/business?business=' + urllib.parse.quote(business['id'], safe='')
    benefits = campaign.get('benefits') or []
    defaults = [{'title': 'Clear business information.', 'description': 'Help AI assistants understand what you offer and where customers should go next.'},
                {'title': 'A practical next step.', 'description': 'Receive a free website review, recommendations and an llms.txt starter file with upload instructions.'}]
    benefits = (benefits + defaults)[:2]
    values = {'BUSINESS_SHORT_NAME': name, 'BUSINESS_URL': url,
              'HEADLINE': campaign.get('headline') or 'Your next customer could start with AI.',
              'PREHEADER': 'A free website review prepared for ' + name + '.',
              'INTRO': 'I grew up around my family’s restaurant and now work in AI. ' + (campaign.get('intro') or 'I put together a starting plan for ' + name + '.') + ' Your first website review is free, with practical recommendations and a starter file you can share with whoever runs your site.',
              'BENEFIT_ONE_TITLE': benefits[0]['title'], 'BENEFIT_ONE_BODY': benefits[0].get('description',''),
              'BENEFIT_TWO_TITLE': benefits[1]['title'], 'BENEFIT_TWO_BODY': benefits[1].get('description',''),
              'CONTROL_NOTE': 'Your team stays in control of availability, pricing and acceptance. Any implementation is agreed with you first.',
              'MAILING_ADDRESS': '[Mailing address required before outreach]',
              'UNSUBSCRIBE_URL': 'mailto:natemitchcook@gmail.com?subject=Stop%20Welvia%20emails'}
    def render(template, escape=False):
        return re.sub(r'\{\{\{([A-Z_]+)\}\}\}', lambda m: html.escape(str(values[m[1]]), quote=True) if escape else str(values[m[1]]), template)
    question = 'One quick question: what is the main thing you are trying to improve in your business right now? If you are stuck on a task, I would love to hear about it, even if it has nothing to do with AI.'
    question_link = 'mailto:natemitchcook@gmail.com?' + urllib.parse.urlencode({'subject': 'My biggest business priority',
                     'body': 'Hi Nate,\n\nThe thing I am working on right now is: '})
    html_email = render(ACQUISITION_HTML, True)
    question_markup = ('<p style="font-family:Arial,Helvetica,sans-serif;color:#18231f;font-size:16px;line-height:25px">'
                       + html.escape(question) + ' <a href="' + html.escape(question_link, quote=True)
                       + '" style="color:#326450;font-weight:bold">Reply and tell me</a>.</p>')
    html_email = re.sub(r'(?=<p style="[^"]*">Nate<br><strong>Founder, Welvia</strong></p>)',
                        lambda match: question_markup, html_email, count=1)
    text_email = render(ACQUISITION_TEXT).replace('Nate\nFounder, Welvia',
                      question + '\n\nJust reply to this email.\n\nNate\nFounder, Welvia')
    return {'from': 'Nate at Welvia <hello@welvia.natemitchcook.com>', 'reply_to': 'natemitchcook@gmail.com',
            'to': [recipient], 'subject': 'A free website review for ' + name,
            'html': html_email, 'text': text_email, 'attachments': []}


def enqueue(db, lead):
    queue = os.environ.get('REVIEW_QUEUE_URL')
    if not queue:
        return 'Awaiting setup'
    if lead.get('email_status') in ('Accepted by Resend', 'Needs manual review', 'Failed'):
        return lead['email_status']
    boto3.client('sqs').send_message(QueueUrl=queue, MessageBody=json.dumps({'lead_key': lead['pk']}))
    return 'Queued'


def deliver(db, key, get_business):
    lead = db.get_item(Key={'pk': key}, ConsistentRead=True).get('Item')
    if not lead or lead.get('email_status') in ('Accepted by Resend', 'Failed', 'Needs manual review'):
        return
    now = int(time.time())
    try:
        db.update_item(Key={'pk': key}, UpdateExpression='SET delivery_lock = :until',
                       ExpressionAttributeValues={':until': now + 120},
                       ConditionExpression=Attr('delivery_lock').not_exists() | Attr('delivery_lock').lt(now))
    except db.meta.client.exceptions.ConditionalCheckFailedException:
        raise RuntimeError('Delivery is already running.')
    try:
        payload = lead.get('email_payload')
        started = int(lead.get('email_started_at', now))
        if now - started >= 23 * 3600:
            set_status(db, key, 'Needs manual review', 'Retry window expired; verify provider before resending.')
            return
        if not payload:
            # Recipient-wide daily cap also covers different IPs and new submission IDs.
            permitted = False
            for slot in range(3):
                throttle = 'REVIEWMAIL#' + digest(lead['answers']['contact_email'].strip().lower()) + '#' + str(now // 86400) + '#' + str(slot)
                try:
                    db.put_item(Item={'pk': throttle, 'lead_key': key, 'expires': now + 2 * 86400},
                                ConditionExpression=Attr('pk').not_exists() | Attr('lead_key').eq(key))
                    permitted = True
                    break
                except db.meta.client.exceptions.ConditionalCheckFailedException:
                    continue
            if not permitted:
                set_status(db, key, 'Needs manual review', 'Recipient daily delivery limit reached.')
                return
            business = get_business(lead['business_id']) if lead['business_id'] != 'general' else {}
            url = lead['answers'].get('business_url') if lead['business_id'] == 'general' else (business or {}).get('site') or (business or {}).get('campaign', {}).get('website')
            try:
                artifact = prepare(db, url or '') if lead['business_id'] == 'general' else prepare_business(db, lead['business_id'])
            except (ValueError, OSError, http.client.HTTPException) as error:
                set_status(db, key, 'Needs manual review', type(error).__name__)
                return
            payload = email_payload(lead, artifact)
            # Freeze the exact request body so retries never change the idempotency payload.
            db.update_item(Key={'pk': key}, UpdateExpression='SET email_payload = :p, email_started_at = :t, artifact_key = :a',
                           ExpressionAttributeValues={':p': payload, ':t': now, ':a': artifact['pk']})
        token = os.environ.get('RESEND_API_KEY')
        if not token:
            raise RuntimeError('Resend credential is not configured.')
        request = urllib.request.Request('https://api.resend.com/emails', data=json.dumps(payload).encode(), method='POST',
                                         headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'WelviaReviews/1.0', 'Idempotency-Key': 'review-' + digest(key)})
        try:
            with urllib.request.urlopen(request, timeout=10) as reply:
                result = json.load(reply)
            if not result.get('id'):
                raise RuntimeError('Resend did not return a message ID.')
        except urllib.error.HTTPError as error:
            if error.code == 429 or error.code >= 500:
                set_status(db, key, 'Retrying', 'Provider HTTP ' + str(error.code))
                raise RuntimeError('Temporary provider failure.') from None
            set_status(db, key, 'Failed', 'Provider HTTP ' + str(error.code))
            return
        except (OSError, ValueError):
            set_status(db, key, 'Retrying', 'Provider connection failure')
            raise RuntimeError('Temporary provider connection failure.') from None
        db.update_item(Key={'pk': key}, UpdateExpression='SET email_status = :s, resend_id = :i, email_accepted_at = :t',
                       ExpressionAttributeValues={':s': 'Accepted by Resend', ':i': result['id'], ':t': int(time.time())})
    finally:
        db.update_item(Key={'pk': key}, UpdateExpression='REMOVE delivery_lock')


def set_status(db, key, status, reason):
    db.update_item(Key={'pk': key}, UpdateExpression='SET email_status = :s, delivery_note = :n',
                   ExpressionAttributeValues={':s': status, ':n': reason})
