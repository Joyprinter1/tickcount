import React from 'react';
import PropTypes from 'prop-types';
import ErrorComponent from './index';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    componentDidCatch = (error, info) => {
        if (window.TrackJS) window.TrackJS.console.log(this.props.root_store);

        this.setState({
            hasError: true,
            error,
            info,
        });
    };
    render = () => {
        if (!this.state.hasError) return this.props.children;
        const { error, info } = this.state;
        const details = [
            String((error && (error.stack || error.message)) || error),
            info && info.componentStack ? String(info.componentStack).split('\n').slice(0, 6).join('\n') : '',
        ]
            .join('\n')
            .slice(0, 1200);
        return (
            <>
                <ErrorComponent should_show_refresh={true} />
                {/* Shown so a screenshot of a crash tells us what went wrong. */}
                <pre
                    style={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 99999,
                        margin: 0,
                        padding: '8px',
                        maxHeight: '35vh',
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: '11px',
                        background: '#111',
                        color: '#ff8a8a',
                    }}
                >
                    {details}
                </pre>
            </>
        );
    };
}

ErrorBoundary.propTypes = {
    root_store: PropTypes.object,
    children: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.node), PropTypes.node]),
};

export default ErrorBoundary;
