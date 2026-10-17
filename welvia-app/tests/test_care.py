"""Run Care foundation tests in the existing Welvia CI suite."""
import os
import sys
import unittest
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "care")))
from test_engine import CareTests
from test_product import ProductTests
