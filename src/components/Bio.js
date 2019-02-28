import React from 'react';
import profilePic from '../assets/profile-pic.jpg';
import { rhythm } from '../utils/typography';

class Bio extends React.Component {
  render() {
    return (
      <div
        style={{
          display: 'flex',
          marginBottom: rhythm(2),
        }}
      >
        <img
          src={profilePic}
          alt={`Dan Abramov`}
          style={{
            marginRight: rhythm(1 / 2),
            marginBottom: 0,
            width: rhythm(2),
            height: rhythm(2),
            borderRadius: '50%',
          }}
        />
        <p
          style={{
            maxWidth: 520,
            height: 56,
            marginBottom: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          💦 我是张浩，前端程序猿一枚，这里是我的技术博客。
        </p>
      </div>
    );
  }
}

export default Bio;
