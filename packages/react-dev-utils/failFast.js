const codeFrame = require('babel-code-frame')
const ansiHTML = require('./ansiHTML')
const StackTraceResolve = require('stacktrace-resolve').default

const errorHelpers = [
  {
    regex: /cannot read property 'setState' of (null|undefined)/i,
    title: 'Trouble with unbound function that use setState?',
    body: '[ADD DESCRIPTION OF GOTCHA AND WHAT TO DO HERE]',
    link: 'https://facebook.github.io/react/docs/handling-events.html'
  }
]

const CONTEXT_SIZE = 3

const black = '#293238'
const darkGray = '#878e91'
const lightGray = '#fafafa'
const red = '#ce1126'
const lightRed = '#fccfcf'
const yellow = '#fbf5b4'

const overlayStyle = {
  position: 'fixed',
  'box-sizing': 'border-box',
  top: '1em', left: '1em',
  bottom: '1em', right: '1em',
  width: 'calc(100% - 2em)', height: 'calc(100% - 2em)',
  'border-radius': '3px',
  'background-color': lightGray,
  padding: '4rem',
  'z-index': 1337,
  'font-family': 'Consolas, Menlo, monospace',
  color: black,
  'white-space': 'pre-wrap',
  overflow: 'auto',
  'box-shadow': '0 0 6px 0 rgba(0, 0, 0, 0.5)',
  'line-height': 1.5,
}

// TODO: reapply containerStyle on resize or externalize to css and ensure
//  e2e checks & tests pass
//  ref commit: 46db1ae54c0449b737f82fb1cf8a47b7457d5b9b
const containerStyle = {
  'margin': '0 auto',
  width: () => calcWidth(window.innerWidth)
}

const hintsStyle = {
  'font-size': '0.8em',
  'margin-top': '-3em',
  'margin-bottom': '3em',
  'text-align': 'right',
  color: darkGray
}

const headerStyle = {
  'font-size': '1.7em',
  'font-weight': 'bold',
  color: red
}

const functionNameStyle = {
  'margin-top': '1em',
  'font-size': '1.2em'
}

const linkStyle = {
  'font-size': '0.9em',
}

const anchorStyle = {
  'text-decoration': 'none',
  color: darkGray
}

const traceStyle = {
  'font-size': '1em'
}

const depStyle = {
  'font-size': '1.2em',
}

const primaryErrorStyle = {
  'background-color': lightRed
}

const secondaryErrorStyle = {
  'background-color': yellow
}
const omittedFramesStyle = {
  color: black,
  'font-size': '0.9em',
  'margin': '1.5em 0',
}

const preStyle = {
  display: 'block',
  padding: '0.5em',
  margin: '1.5em 0',
  'overflow-x': 'auto',
  'font-size': '1.1em'
}

const codeStyle = {
  'font-family': 'Consolas, Menlo, monospace',
}

const errorHelperStyle = {
  'margin-top': '1em',
  border: '1px solid rgba(0, 0, 0, 0.08)',
  'border-radius': '4px',
}

const errorHelperTitleStyle = {
  'padding': '1em',
  'background-color': '',
  'border-bottom': '1px solid rgba(0, 0, 0, 0.08)',
  'font-size': '1.5em',
}

const errorHelperBodyStyle = {
  'padding': '0 1em',
  'background-color': '',
}

function calcWidth(width) {
  if (width >= 1200) return '1170px'
  if (width >= 992) return '970px'
  if (width >= 768) return '750px'
  return 'auto'
}

function applyStyles(element, styles) {
  element.setAttribute('style', '')
  // Firefox can't handle const due to non-compliant implementation
  // Revisit Jan 2016
  // https://developer.mozilla.org/en-US/Firefox/Releases/51#JavaScript
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1101653
  for (let key in styles) {
    if (!styles.hasOwnProperty(key)) continue
    let val = styles[key]
    if (typeof val === 'function') val = val()
    element.style[key] = val.toString()
  }
}

let overlayReference = null
let errorCache = null
let additionalCount = 0
let internalDisabled = true
let sourceDisabled = false

function toggleInternal() {
  internalDisabled = !internalDisabled
  if (errorCache != null) {
    unmount()
    crash(errorCache)
  }
}

function toggleSource() {
  sourceDisabled = !sourceDisabled
  if (errorCache != null) {
    unmount()
    crash(errorCache)
  }
}

function renderAdditional() {
  ++additionalCount
  const title = overlayReference.childNodes[1].childNodes[0]
  const children = title.childNodes
  const text = document.createTextNode(` (+${additionalCount} more)`)
  if (children.length < 2) {
    title.appendChild(text)
  } else {
    title.removeChild(children[children.length - 1])
    title.appendChild(text)
  }
}

function sourceCodePre(sourceLines, lineNum, columnNum, main = false) {
  let sourceCode = []
  sourceLines.forEach(({ text, line }) => {
    sourceCode[line - 1] = text
  })
  sourceCode = sourceCode.join('\n')
  const ansiHighlight = codeFrame(sourceCode, lineNum, columnNum, {
    highlightCode: true,
    linesAbove: CONTEXT_SIZE,
    linesBelow: CONTEXT_SIZE
  })
  const htmlHighlight = ansiHTML(ansiHighlight)
  const code = document.createElement('code')
  code.innerHTML = htmlHighlight
  applyStyles(code, codeStyle)

  for (let node of code.childNodes) {
    let breakOut = false
    for (let lineNode of node.childNodes) {
      if (lineNode.innerText.indexOf(` ${lineNum} |`) === -1) continue
      applyStyles(node, main ? primaryErrorStyle : secondaryErrorStyle)
      breakOut = true
    }
    if (breakOut) break
  }
  const pre = document.createElement('pre')
  applyStyles(pre, preStyle)
  pre.appendChild(code)
  return pre
}

function hintsDiv() {
  const hints = document.createElement('div')
  hints.appendChild(document.createTextNode(`[i] ${internalDisabled ? 'Show' : 'Hide'} internal calls`))
  hints.appendChild(document.createTextNode('\t\t'))
  hints.appendChild(document.createTextNode(`[s] ${sourceDisabled ? 'Hide' : 'Show'} script source`))
  hints.appendChild(document.createTextNode('\t\t'))
  hints.appendChild(document.createTextNode('[escape] Close'))
  applyStyles(hints, hintsStyle)
  return hints;
}

function frameDiv(functionName, url, internalUrl) {
  const frame = document.createElement('div')
  const frameFunctionName = document.createElement('div')

  let cleanedFunctionName;
  if (!functionName || functionName === 'Object.<anonymous>') {
    cleanedFunctionName = '(anonymous function)'
  } else {
    cleanedFunctionName = functionName
  }

  let cleanedUrl = url.replace('webpack://', '.');

  if (internalUrl) {
    applyStyles(frameFunctionName, Object.assign({}, functionNameStyle, depStyle))
  } else {
    applyStyles(frameFunctionName, functionNameStyle)
  }

  frameFunctionName.appendChild(document.createTextNode(cleanedFunctionName))
  frame.appendChild(frameFunctionName)

  const frameLink = document.createElement('div')
  applyStyles(frameLink, linkStyle)
  const frameAnchor = document.createElement('a')
  applyStyles(frameAnchor, anchorStyle)
  //frameAnchor.href = url
  frameAnchor.appendChild(document.createTextNode(cleanedUrl))
  frameLink.appendChild(frameAnchor)
  frame.appendChild(frameLink)

  return frame;
}

function traceDiv(resolvedFrames) {
  const trace = document.createElement('div')
  applyStyles(trace, traceStyle)
  // Firefox can't handle const due to non-compliant implementation
  // Revisit Jan 2016
  // https://developer.mozilla.org/en-US/Firefox/Releases/51#JavaScript
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1101653
  let omittedFramesCount = 0
  const appendOmittedFrames = () => {
    if (!omittedFramesCount) return
    const omittedFrames = document.createElement('div')
    omittedFrames.appendChild(document.createTextNode(`---[ ${omittedFramesCount} internal calls hidden ]---`))
    applyStyles(omittedFrames, omittedFramesStyle)
    trace.appendChild(omittedFrames)
    omittedFramesCount = 0
  }
  let main = true
  for (let frame of resolvedFrames) {
    const {
      functionName,
      fileName, lineNumber, columnNumber,
      scriptLines,
      sourceFileName, sourceLineNumber, sourceColumnNumber,
      sourceLines
    } = frame

    // Skip native functions like Array.forEach
    if (fileName === '(native)') continue;

    let url
    if (sourceFileName) {
      url = sourceFileName + ':' + sourceLineNumber
      if (sourceColumnNumber) url += ':' + sourceColumnNumber
    } else {
      url = fileName + ':' + lineNumber
      if (columnNumber) url += ':' + columnNumber
    }

    const internalUrl = isInternalFile(url)
    if (internalUrl && internalDisabled) {
      omittedFramesCount++
      continue
    }

    appendOmittedFrames()

    const elem = frameDiv(functionName, url, internalUrl);

    if (!internalUrl) {
      if (sourceDisabled && scriptLines.length !== 0) {
        elem.appendChild(sourceCodePre(scriptLines, lineNumber, columnNumber, main))
      } else if (!sourceDisabled && sourceLines.length !== 0) {
        elem.appendChild(sourceCodePre(sourceLines, sourceLineNumber, sourceColumnNumber, main))
      }
      main = false
    }

    trace.appendChild(elem)
  }
  appendOmittedFrames()
  return trace;
}

function findKnownError(errMessage) {
  for (const helper of errorHelpers) {
    if (helper.regex.test(errMessage)) {
      return helper
    }
  }

  return null;
}

function errorHelper(errMessage) {
  const errorHelper = document.createElement('div')
  const knownError = findKnownError(errMessage)

  if (!knownError) return errorHelper;

  applyStyles(errorHelper, errorHelperStyle)
  const title = document.createElement('div')
  title.appendChild(document.createTextNode(knownError.title))
  applyStyles(title, errorHelperTitleStyle)
  errorHelper.appendChild(title)

  const body = document.createElement('p')
  body.appendChild(document.createTextNode(knownError.body))
  applyStyles(body, errorHelperBodyStyle)
  errorHelper.appendChild(body)

  if (knownError.link) {
    const link = document.createElement('p')
    applyStyles(link, errorHelperBodyStyle)
    link.appendChild(document.createTextNode('Additional Reading: '))
    const anchor = document.createElement('a');
    anchor.appendChild(document.createTextNode(knownError.link))
    anchor.href = knownError.link;
    link.appendChild(anchor);
    errorHelper.appendChild(link)
  }

  return errorHelper;
}

function render(error, name, message, resolvedFrames) {
  if (overlayReference !== null) {
    renderAdditional()
    return
  }

  // Create overlay
  const overlay = document.createElement('div')
  applyStyles(overlay, overlayStyle)
  overlay.appendChild(hintsDiv())

  // Create container
  const container = document.createElement('div')
  applyStyles(container, containerStyle)
  overlay.appendChild(container)

  // Create header
  const header = document.createElement('div')
  applyStyles(header, headerStyle)
  header.appendChild(document.createTextNode(`${name}: ${message}`))
  container.appendChild(header)

  // Create error helper
  container.appendChild(errorHelper(message));

  // Create trace
  container.appendChild(traceDiv(resolvedFrames))

  // Mount
  document.body.appendChild(overlayReference = overlay)
  errorCache = error
  additionalCount = 0
}

function unmount() {
  if (overlayReference === null) return
  document.body.removeChild(overlayReference)
  overlayReference = null
}

function isInternalFile(url) {
  return url.indexOf('/~/') !== -1 || url.trim().indexOf(' ') !== -1
}

function crash(error, unhandledRejection = false) {
  StackTraceResolve(error, CONTEXT_SIZE).then(function(resolvedFrames) {
    if (unhandledRejection) {
      render(error, `Unhandled Rejection (${error.name})`, error.message, resolvedFrames)
    } else {
      render(error, error.name, error.message, resolvedFrames)
    }
  }).catch(function(e) {
    // This is another fail case (unlikely to happen)
    // e.g. render(...) throws an error with provided arguments
    console.log('Red box renderer error:', e)
    render(null, 'Error', 'Unknown Error (failure to materialize)', [])
  })
}

window.onerror = function(messageOrEvent, source, lineno, colno, error) {
  if (error == null || !(error instanceof Error) || messageOrEvent.indexOf('Script error') !== -1) {
    crash(new Error(error || messageOrEvent))// TODO: more helpful message
  } else {
    crash(error)
  }
}

let promiseHandler = function(event) {
  if (event != null && event.reason != null) {
    const { reason } = event
    if (reason == null || !(reason instanceof Error)) {
      crash(new Error(reason), true)
    } else {
      crash(reason, true)
    }
  } else {
    crash(new Error('Unknown event'), true)
  }
}

window.addEventListener('unhandledrejection', promiseHandler)

let escapeHandler = function(event) {
  const { key, keyCode, which } = event
  if (key === 'Escape' || keyCode === 27 || which === 27) unmount()
  else if (key === 'i' || keyCode === 73 || which === 73) toggleInternal()
  else if (key === 's' || keyCode === 83 || which === 83) toggleSource()
}

window.addEventListener('keydown', escapeHandler)

try {
  Error.stackTraceLimit = 50
} catch (e) { }

if (module.hot) {
  module.hot.dispose(function() {
    unmount()
    window.removeEventListener('unhandledrejection', promiseHandler)
    window.removeEventListener('keydown', escapeHandler)
  })
}
