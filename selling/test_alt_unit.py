from decimal import Decimal
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken

from selling.models import Customer, SalesInvoice
from stock.models import Item


class AlternateUnitBillingTests(APITestCase):
    def setUp(self):
        admin = User.objects.create_superuser('alt_admin', 'alt@example.com', 'x')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(admin).access_token}')
        self.customer = Customer.objects.create(customer_name='Alt Unit Customer')
        # Item 1: 1 Kg = 3 Nos, Selling Rate = Rs 90 / Kg (Rs 30 / Nos)
        self.rod_3 = Item.objects.create(
            item_code='FG-ALT-3',
            item_name='Iron Rod 12mm',
            unit='Kg',
            alt_unit='Nos',
            conversion_factor=Decimal('3.0000'),
            standard_rate=Decimal('60.00'),
            selling_rate=Decimal('90.00'),
            current_stock=Decimal('100.00'),
        )
        # Item 2: 1 Kg = 4 Nos, Selling Rate = Rs 100 / Kg (Rs 25 / Nos)
        self.rod_4 = Item.objects.create(
            item_code='FG-ALT-4',
            item_name='Iron Rod 10mm',
            unit='Kg',
            alt_unit='Nos',
            conversion_factor=Decimal('4.0000'),
            standard_rate=Decimal('70.00'),
            selling_rate=Decimal('100.00'),
            current_stock=Decimal('50.00'),
        )

    def test_sell_in_alternate_unit_deducts_primary_stock_on_approve(self):
        payload = {
            'invoice_number': 'INV-ALT-01',
            'customer': self.customer.id,
            'customer_name': self.customer.customer_name,
            'posting_date': '2026-02-01',
            'net_total': '2100.00',
            'tax_amount': '378.00',
            'grand_total': '2478.00',
            'items': [
                {
                    'item': self.rod_3.id,
                    'billed_unit': 'Nos',
                    'quantity': 60,
                    'rate': 30,
                    'amount': '1800.00',
                },
                {
                    'item': self.rod_4.id,
                    'billed_unit': 'Nos',
                    'quantity': 12,
                    'rate': 25,
                    'amount': '300.00',
                },
            ],
        }
        res = self.client.post('/api/selling/invoices/', payload, format='json')
        self.assertEqual(res.status_code, 201, res.content)

        inv = SalesInvoice.objects.get(invoice_number='INV-ALT-01')
        line1 = inv.items.get(item=self.rod_3)
        self.assertEqual(line1.billed_unit, 'Nos')
        self.assertEqual(line1.billed_qty, Decimal('60.00'))
        self.assertEqual(line1.quantity, Decimal('20.00'))
        self.assertEqual(line1.rate, Decimal('90.00'))

        line2 = inv.items.get(item=self.rod_4)
        self.assertEqual(line2.billed_qty, Decimal('12.00'))
        self.assertEqual(line2.quantity, Decimal('3.00'))
        self.assertEqual(line2.rate, Decimal('100.00'))

        # Draft holds stock untouched until approved
        self.rod_3.refresh_from_db()
        self.assertEqual(self.rod_3.current_stock, Decimal('100.00'))

        # Approve deducts exact converted primary stock
        app_res = self.client.post(f'/api/selling/invoices/{inv.id}/approve/')
        self.assertEqual(app_res.status_code, 200, app_res.content)

        self.rod_3.refresh_from_db()
        self.rod_4.refresh_from_db()
        self.assertEqual(self.rod_3.current_stock, Decimal('80.00'))
        self.assertEqual(self.rod_4.current_stock, Decimal('47.00'))
