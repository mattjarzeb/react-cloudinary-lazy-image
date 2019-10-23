import React from 'react'
import PropTypes from 'prop-types'

const makeUrlParams = props => {
  let { urlParams, imgFormat, quality, fluid } = props
  imgFormat = typeof imgFormat === `boolean`
    ? imgFormat
      ? `f_auto` : ''
    : imgFormat
  quality = typeof quality === `boolean`
    ? quality
      ? `q_auto` : ''
    : typeof quality === `string` && quality.includes(`q_auto`)
      ? `q_auto:${quality}`
      : quality
  if (!urlParams || !urlParams.length) {
    urlParams = 'c_lfill'
    if (fluid && !fluid.height) urlParams = 'c_scale'
  }
  const toUrl = [imgFormat, quality, urlParams].filter(e => e && e.length)
  return toUrl.join(',')
}

// Cache if we've seen an image before so we don't both with
// lazy-loading & fading in on subsequent mounts.
const imageCache = {}
const inImageCache = props => {
  const image = props.fluid || props.fixed
  let urlParams = makeUrlParams(props)
  urlParams = props.fluid
    ? `${urlParams},w_${image.maxWidth}${image.height ? `,h_${image.height}` : ''}`
    : `${urlParams},w_${image.width},h_${image.height}`
  // Find src
  const src = `https://res.cloudinary.com/${props.cloudName}/image/upload/${urlParams}/${props.version}/${props.imageName}`

  if (imageCache[src]) {
    return true
  } else {
    imageCache[src] = true
    return false
  }
}

let io
const listeners = []

function getIO () {
  if (
    typeof io === `undefined` &&
    typeof window !== `undefined` &&
    window.IntersectionObserver
  ) {
    io = new window.IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          listeners.forEach(l => {
            if (l[0] === entry.target) {
              // Edge doesn't currently support isIntersecting, so also test for an intersectionRatio > 0
              if (entry.isIntersecting || entry.intersectionRatio > 0) {
                io.unobserve(l[0])
                l[1]()
              }
            }
          })
        })
      },
      { rootMargin: `200px` }
    )
  }

  return io
}

const listenToIntersections = (el, cb) => {
  getIO().observe(el)
  listeners.push([el, cb])
}

const noscriptImg = props => {
  // Check if prop exists before adding each attribute to the string output below to prevent
  // HTML validation issues caused by empty values like width="" and height=""
  const src = props.src ? `src="${props.src}" ` : `src="" ` // required attribute
  const title = props.title ? `title="${props.title}" ` : ``
  const alt = `alt="${props.alt}"` // required attribute
  const width = props.width ? `width="${props.width}" ` : ``
  const height = props.height ? `height="${props.height}" ` : ``
  const opacity = props.opacity ? props.opacity : `1`
  const transitionDelay = props.transitionDelay ? props.transitionDelay : `0.5s`
  return `<img ${width}${height}${src}${alt}${title}style="position:absolute;top:0;left:0;transition:opacity 0.5s;transition-delay:${transitionDelay};opacity:${opacity};width:100%;height:100%;object-fit:cover;object-position:center"/>`
}

const Img = React.forwardRef((props, ref) => {
  const { style, onLoad, onError, ...otherProps } = props

  return (
    <img
      {...otherProps}
      onLoad={onLoad}
      onError={onError}
      ref={ref}
      style={{
        position: `absolute`,
        top: 0,
        left: 0,
        width: `100%`,
        height: `100%`,
        objectFit: `cover`,
        objectPosition: `center`,
        ...style
      }}
    />
  )
})

Img.propTypes = {
  style: PropTypes.object,
  onError: PropTypes.func,
  onLoad: PropTypes.func
}

class Image extends React.Component {
  constructor (props) {
    super(props)

    // If this browser doesn't support the IntersectionObserver API
    // we default to start downloading the image right away.
    let isVisible = true
    let imgLoaded = true
    let IOSupported = false
    let fadeIn = props.fadeIn

    // If this image has already been loaded before then we can assume it's
    // already in the browser cache so it's cheap to just show directly.
    const seenBefore = inImageCache(props)

    if (
      !seenBefore &&
      typeof window !== `undefined` &&
      window.IntersectionObserver
    ) {
      isVisible = false
      imgLoaded = false
      IOSupported = true
    }

    // Always don't render image while server rendering
    if (typeof window === `undefined`) {
      isVisible = false
      imgLoaded = false
    }

    const hasNoScript = this.props.fadeIn

    this.state = {
      isVisible,
      imgLoaded,
      IOSupported,
      fadeIn,
      hasNoScript,
      seenBefore
    }

    this.imageRef = React.createRef()
    this.handleImageLoaded = this.handleImageLoaded.bind(this)
    this.handleRef = this.handleRef.bind(this)
  }

  handleRef (ref) {
    if (this.state.IOSupported && ref) {
      listenToIntersections(ref, () => {
        this.setState({ isVisible: true })
      })
    }
  }

  handleImageLoaded () {
    this.setState({ imgLoaded: true })
    if (this.state.seenBefore) {
      this.setState({ fadeIn: false })
    }
    this.props.onLoad && this.props.onLoad()
  }

  createBrakePointsFixed (urlCore) {
    const results = []
    const image = this.props.fixed
    for (let i = 1; i < 3; i++) {
      const params = `${urlCore},w_${image.width * i},h_${image.height * i}`
      results.push(`https://res.cloudinary.com/${this.props.cloudName}/image/upload/${params}/${this.props.version}/${this.props.imageName} ${i}x`)
    }
    return results.join(',')
  }

  createBrakePointsFluid (urlCore) {
    const image = this.props.fluid
    const step = image.step || 150
    let size = 150
    const results = []
    while (size < image.maxWidth) {
      const params = `${urlCore},w_${size}${image.height ? `,h_${Math.ceil(size * this.getAspectRatio(image))}` : ''}`
      results.push(`https://res.cloudinary.com/${this.props.cloudName}/image/upload/${params}/${this.props.version}/${this.props.imageName} ${size}w`)
      size = size + step
    }

    results.push(
      `https://res.cloudinary.com/${this.props.cloudName}/image/upload/${urlCore},w_${image.maxWidth}${image.height ? `,h_${image.height}` : ''}/${this.props.version}/${this.props.imageName} ${image.maxWidth}w`
    )
    return results.join(',')
  }

  getAspectRatio(image) {
    return image.height > image.maxWidth
      ? image.height / image.maxWidth
      : image.maxWidth / image.height
  }

  render () {
    const {
      title,
      alt,
      cloudName,
      imageName,
      style = {},
      imgStyle = {},
      placeholderStyle = {},
      fluid,
      fixed,
      backgroundColor
    } = this.props

    let urlParams = makeUrlParams(this.props)

    const bgColor = typeof backgroundColor === `boolean` ? `lightgray` : backgroundColor

    const imagePlaceholderStyle = {
      opacity: this.state.imgLoaded ? 0 : 1,
      transition: `opacity 0.5s`,
      transitionDelay: this.state.imgLoaded ? `0.5s` : `0.25s`,
      ...imgStyle,
      ...placeholderStyle
    }

    const imageStyle = {
      position: 'relative',
      opacity: this.state.imgLoaded || this.state.fadeIn === false ? 1 : 0,
      transition: this.state.fadeIn === true ? `opacity 0.5s` : `none`,
      ...imgStyle
    }

    const placeholderImageProps = {
      title,
      alt: !this.state.isVisible ? alt : ``,
      style: imagePlaceholderStyle
    }
    let image
    let divStyle
    let bgPlaceholderStyles
    let srcSet
    if (fluid) {
      image = fluid
      divStyle = {
        position: `relative`,
        overflow: `hidden`,
        ...style
      }
      bgPlaceholderStyles = {
        backgroundColor: bgColor,
        position: `absolute`,
        top: 0,
        bottom: 0,
        opacity: !this.state.imgLoaded ? 1 : 0,
        transitionDelay: `0.35s`,
        right: 0,
        left: 0
      }
      srcSet = this.createBrakePointsFluid(urlParams)
      urlParams = `${urlParams},w_${image.maxWidth}${image.height ? `,h_${image.height}` : ''}`
    }
    if (fixed) {
      image = fixed
      divStyle = {
        position: `relative`,
        overflow: `hidden`,
        display: `inline-block`,
        width: image.width,
        height: image.height,
        ...style
      }
      bgPlaceholderStyles = {
        backgroundColor: bgColor,
        width: image.width,
        height: image.height,
        opacity: !this.state.imgLoaded ? 1 : 0,
        transitionDelay: `0.25s`
      }
      srcSet = this.createBrakePointsFixed(urlParams)
      urlParams = `${urlParams},w_${image.width},h_${image.height}`
    }

    if (style.display === `inherit`) {
      delete divStyle.display
    }
    if (fluid || fixed) {
      return (
        <div
          style={divStyle}
          ref={this.handleRef}
        >
          {/* Show a blurred version. */}
          {!bgColor &&
          <Img
            src={`https://res.cloudinary.com/${cloudName}/image/upload/c_scale,w_20,f_auto/${this.props.version}/${imageName}`}
            {...placeholderImageProps}
          />
          }

          {/* Show a solid background color. */}
          {bgColor && (
            <div
              title={title}
              style={bgPlaceholderStyles}
            />
          )}

          {/* Once the image is visible (or the browser doesn't support IntersectionObserver), start downloading the image */}
          {this.state.isVisible && (
            <Img
              alt={alt}
              title={title}
              src={`https://res.cloudinary.com/${cloudName}/image/upload/${urlParams}/${this.props.version}/${imageName}`}
              srcSet={srcSet}
              style={imageStyle}
              ref={this.imageRef}
              onLoad={this.handleImageLoaded}
              onError={this.props.onError}
            />
          )}

          {/* Show the original image during server-side rendering if JavaScript is disabled */}
          {this.state.hasNoScript && (
            <noscript
              dangerouslySetInnerHTML={{
                __html: noscriptImg({ alt, title, ...image })
              }}
            />
          )}
        </div>
      )
    }
    return null
  }
}

Image.defaultProps = {
  cloudName: process.env.CLOUD_NAME || process.env.REACT_APP_CLOUD_NAME,
  fadeIn: true,
  alt: ``,
  version: ``,
  imgFormat: true,
  quality: true
}

const fixedObject = PropTypes.shape({
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired
})

const fluidObject = PropTypes.shape({
  maxWidth: PropTypes.number.isRequired,
  height: PropTypes.number,
  step: PropTypes.number
})

Image.propTypes = {
  fixed: fixedObject,
  fluid: fluidObject,
  urlParams: PropTypes.string,
  fadeIn: PropTypes.bool,
  title: PropTypes.string,
  alt: PropTypes.string,
  cloudName: PropTypes.string,
  imageName: PropTypes.string.isRequired,
  style: PropTypes.object,
  imgStyle: PropTypes.object,
  placeholderStyle: PropTypes.object,
  backgroundColor: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  onLoad: PropTypes.func,
  onError: PropTypes.func,
  imgFormat: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  quality: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  version: PropTypes.string
}

export default Image
