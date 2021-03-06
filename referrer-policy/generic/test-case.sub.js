// https://w3c.github.io/webappsec-referrer-policy/#strip-url
function stripUrlForUseAsReferrer(url, originOnly) {
  // Step 2. If url’s scheme is a local scheme, then return no referrer.
  const parsedUrl = new URL(url);

  if (["about:", "blob:", "data:"].includes(parsedUrl.protocol))
    return undefined;

  // Step 3. Set url’s username to the empty string.
  parsedUrl.username = '';

  // Step 4. Set url’s password to null.
  parsedUrl.password = '';

  // Step 5. Set url’s fragment to null.
  parsedUrl.hash = '';

  //  Step 6. If the origin-only flag is true, then:
  if (originOnly) {
    // Step 6.1. Set url’s path to null.
    parsedUrl.pathname = '';
    // Step 6.2. Set url’s query to null.
    parsedUrl.search = '';
  }
  return parsedUrl.href;
}

function invokeScenario(scenario) {
  const urls = getRequestURLs(
    scenario.subresource,
    scenario.origin,
    scenario.redirection);
  /** @type {Subresource} */
  const subresource = {
    subresourceType: scenario.subresource,
    url: urls.testUrl,
    policyDeliveries: scenario.subresource_policy_deliveries,
  };

  return invokeRequest(subresource, scenario.source_context_list);
}

const referrerUrlResolver = {
  "omitted": function(sourceUrl) {
    return undefined;
  },
  "origin": function(sourceUrl) {
    return stripUrlForUseAsReferrer(sourceUrl, true);
  },
  "stripped-referrer": function(sourceUrl) {
    return stripUrlForUseAsReferrer(sourceUrl, false);
  }
};

function checkResult(scenario, expectation, result) {
// https://w3c.github.io/webappsec-referrer-policy/#determine-requests-referrer
  let referrerSource = result.sourceContextUrl;
  const sentFromSrcdoc = scenario.source_context_list.length > 0 &&
      scenario.source_context_list[scenario.source_context_list.length - 1]
      .sourceContextType === 'srcdoc';
  if (sentFromSrcdoc) {
    // Step 3. While document is an iframe srcdoc document, let document be
    // document's browsing context's browsing context container's node
    // document. [spec text]

    // Workaround for srcdoc cases. Currently we only test <iframe srcdoc>
    // inside the top-level Document, so |document| in the spec here is
    // the top-level Document.
    // This doesn't work if e.g. we test <iframe srcdoc> inside another
    // external <iframe>.
    referrerSource = location.toString();
  }
  const expectedReferrerUrl =
    referrerUrlResolver[expectation](referrerSource);

  // Check the reported URL.
  assert_equals(result.referrer,
                expectedReferrerUrl,
                "Reported Referrer URL is '" +
                expectation + "'.");
  assert_equals(result.headers.referer,
                expectedReferrerUrl,
                "Reported Referrer URL from HTTP header is '" +
                expectedReferrerUrl + "'");
}

function runLengthTest(scenario, urlLength, expectation, testDescription) {
  // `Referer` headers with length over 4k are culled down to an origin, so,
  // let's test around that boundary for tests that would otherwise return
  // the complete URL.
  history.pushState(null, null, "/");
  history.replaceState(null, null,
      "A".repeat(urlLength - location.href.length));

  promise_test(t => {
    assert_equals(scenario.expectation, "stripped-referrer");
    // Only on top-level Window, due to navigations using `history`.
    assert_equals(scenario.source_context_list.length, 0);

    return invokeScenario(scenario)
      .then(result => checkResult(scenario, expectation, result));
  }, testDescription);
}

function TestCase(scenario, testDescription, sanityChecker) {
  // This check is A NOOP in release.
  sanityChecker.checkScenario(scenario);

  function runTest() {
    promise_test(_ => {
      return invokeScenario(scenario)
        .then(result => checkResult(scenario, scenario.expectation, result));
    }, testDescription);
  }

  return {start: runTest};
}
