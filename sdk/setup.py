"""
setup.py for ML-O11Y Security SDK.
"""

from setuptools import setup, find_packages

setup(
    name="mlo11y",
    version="1.0.0",
    description="Zero-latency API Security Observability & Active Defense SDK for Flask",
    long_description=open("README.md", encoding="utf-8").read() if __import__("os").path.exists("README.md") else "ML-O11Y Security SDK",
    long_description_content_type="text/markdown",
    author="ML-O11Y Security Team",
    packages=["mlo11y", "security_sdk"],
    py_modules=["middleware"],
    install_requires=[
        "flask>=2.0.0",
        "requests>=2.25.0",
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "Framework :: Flask",
        "Topic :: Security",
        "Topic :: System :: Monitoring",
    ],
    python_requires=">=3.8",
)
