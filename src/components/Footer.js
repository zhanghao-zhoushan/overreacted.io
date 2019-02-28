import React from 'react';

import { rhythm } from '../utils/typography';

class Footer extends React.Component {
  render() {
    return (
      <footer
        style={{
          marginTop: rhythm(2.5),
          paddingTop: rhythm(1),
        }}
      >
        {/* <div style={{ float: 'right' }}>
          <a href="/rss.xml" target="_blank" rel="noopener noreferrer">
            rss
          </a>
        </div> */}
        <a
          href="https://github.com/zhanghao-zhoushan"
          target="_blank"
          rel="noopener noreferrer"
        >
          github
        </a>{' '}
        &bull;{' '}
        <a
          href="https://mobile.twitter.com/Just__Sailor"
          target="_blank"
          rel="noopener noreferrer"
        >
          twitter
        </a>{' '}
        &bull;{' '}
        <a
          href="https://juejin.im/user/58c66fc2128fe1006b423f5e"
          target="_blank"
          rel="noopener noreferrer"
        >
          掘金
        </a>
      </footer>
    );
  }
}

export default Footer;
