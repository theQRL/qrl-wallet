Feature: Open Wallet and Send Token Creation Txn
    As a visitor to the site,
    I should be able to open an existing wallet
    And create a token with it

Background:
    Given I am on the wallet site

@watch
Scenario: Visitor opens a wallet and creates a token
    When I click Open Wallet
    And enter my mnemonic phrase "absorb filled syrup axle occupy club fairly break liquid major patrol forbid throat swing emit hey inward blood pillow esteem madame cope under tent hawse glory muscle order bruise bold dad get carpet talk"
    And click Unlock Wallet
    Then I should see "Unlocking wallet..." on the page
    And I should then see my wallet address "Q01050058bb3f8cb66fd90d0347478e5bdf3a475e82cfc5fe5dc276500ca21531e6edaf3d2d0f7e" on the page
    When I click Create Token
    And I fill in the Owner address as "Q01050058bb3f8cb66fd90d0347478e5bdf3a475e82cfc5fe5dc276500ca21531e6edaf3d2d0f7e"
    And I fill in the token symbol as "MNT"
    And I fill in the token name as "Mocknet Test"
    And I set the decimals to "4"
    And I fill in holder address 1 as "Q01050058bb3f8cb66fd90d0347478e5bdf3a475e82cfc5fe5dc276500ca21531e6edaf3d2d0f7e"
    And I fill in holder balance 1 as "50000"
    And I click Add Another Holder
    And I fill in holder address 2 as "Q010200a3f33bbfff9432bee62828345ba4cb6e24182a43ea38f472ad3cf775941b25c0870d6f41"
    And I fill in holder balance 2 as "60000"
    And enter the fee as "0.005"
    And change the OTS Key Index to "11"
    And click create token
    And I should then see a form confirming my token creation transaction
    When I then click confirmation token
    Then I should see the relaying message "Your token is being relayed into the QRL network..."
    And I should see shortly after success message "Success! Your token has been relayed into the QRL network through the following nodes, and is pending validation."
    And I should see the pending message "Transaction Status: Pending"
    And shortly after I should see confirmation message "Transaction Status: Complete - Transaction"
